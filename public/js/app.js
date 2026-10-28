/* =========================================================
   App: casca do painel
   - navegação (menu lateral, trilha, hash #tela)
   - busca rápida de telas (Ctrl+K)
   - modais de formulário e de confirmação
   - tema, marca e menu do usuário
   As telas ficam em js/views/*.js.
   ========================================================= */
const App = {
  meta: null,
  currentKey: null,
  weekAnchor: new Date(),

  async init(){
    this.wireGlobalEvents();
    try {
      this.meta = await API.get("/meta");
    } catch(err){
      document.getElementById("content").innerHTML = errorHTML(err);
      document.getElementById("viewTitle").textContent = "Erro";
      return;
    }
    document.getElementById("resetData").hidden = !this.meta.allowReset;
    document.getElementById("appVersion").textContent = this.meta.versao ? `v${this.meta.versao}` : "";
    this.applyBranding(this.meta.config);
    this.renderUser();
    this.buildNav();
    const initial = decodeURIComponent(location.hash.slice(1)) || "home";
    await this.navigate(this.findItem(initial) ? initial : "home", { replace: true });
    window.addEventListener("hashchange", () => {
      const key = decodeURIComponent(location.hash.slice(1)) || "home";
      if (key !== this.currentKey) this.navigate(key, { replace: true });
    });
  },

  findItem(key){
    for (const group of this.meta.groups){
      const item = group.items.find(i => i.key === key);
      if (item) return { item, group };
    }
    return null;
  },

  /* ---------------- MENU LATERAL ---------------- */
  collapsedGroups(){
    try { return new Set(JSON.parse(localStorage.getItem("navCollapsed") || "[]")); } catch { return new Set(); }
  },

  buildNav(){
    const nav = document.getElementById("nav");
    const fechados = this.collapsedGroups();
    nav.innerHTML = `
      <button class="nav-home" data-key="home">${iconSVG("home")}<span>Visão geral</span></button>
      ${this.meta.groups.map(group => `
        <div class="nav-group ${fechados.has(group.key) ? "collapsed" : ""}" data-group="${esc(group.key)}">
          <button class="nav-group-label" type="button" aria-expanded="${!fechados.has(group.key)}">
            <span>${esc(group.label)}</span>${iconSVG("chevron", "nav-caret")}
          </button>
          <div class="nav-group-items">
            ${group.items.map(item => `
              <button class="nav-item" data-key="${esc(item.key)}">
                ${iconSVG(item.icon)}<span>${esc(item.label)}</span>
                <span class="badge-count" data-count-for="${esc(item.key)}" hidden></span>
              </button>`).join("")}
          </div>
        </div>`).join("")}
    `;
    nav.querySelectorAll(".nav-item, .nav-home").forEach(btn => {
      btn.addEventListener("click", () => this.navigate(btn.dataset.key));
    });
    nav.querySelectorAll(".nav-group-label").forEach(btn => btn.addEventListener("click", () => {
      const g = btn.closest(".nav-group");
      this.setGroupOpen(g, g.classList.contains("collapsed"));
    }));
    this.refreshNavCounts();
    this.setPendingBadge(this.meta.pendentes ?? 0);
  },

  setGroupOpen(g, open){
    g.classList.toggle("collapsed", !open);
    g.querySelector(".nav-group-label").setAttribute("aria-expanded", String(open));
    const fechados = this.collapsedGroups();
    open ? fechados.delete(g.dataset.group) : fechados.add(g.dataset.group);
    try { localStorage.setItem("navCollapsed", JSON.stringify([...fechados])); } catch {}
  },

  /* cadastros aguardando aprovação (só admins recebem esse número) */
  setPendingBadge(n){
    const el = document.querySelector('[data-count-for="usuarios"]');
    if (!el) return;
    el.hidden = n === 0;
    el.textContent = n;
    el.closest(".nav-item").classList.toggle("risk", n > 0);
  },

  /* quantos chamados estão atrasados ou vencem em < 24h */
  async refreshNavCounts(){
    if (!this.findItem("chamados-risco") && !this.findItem("dashboards-sla")) return;
    let n = 0;
    try { n = (await API.get("/resumo/alertas")).chamadosEmRisco; }
    catch { return; }
    ["chamados-risco", "dashboards-sla"].forEach(key => {
      const el = document.querySelector(`[data-count-for="${key}"]`);
      if (!el) return;
      el.hidden = n === 0;
      el.textContent = n;
      el.closest(".nav-item").classList.toggle("risk", n > 0);
    });
  },

  /* nome, subtítulo e cor definidos em Administração → Configurações */
  applyBranding(config){
    if (!config) return;
    this.meta.config = config;
    document.getElementById("brandName").textContent = config.nomePainel;
    document.getElementById("brandSub").textContent = config.subtitulo || "";
    document.getElementById("brandMark").textContent = initials(config.nomePainel);
    document.documentElement.dataset.accent = config.corDestaque;
    try { localStorage.setItem("accent", config.corDestaque); } catch {}
  },

  get brand(){ return this.meta?.config?.nomePainel || "Painel de Gestão"; },

  renderUser(){
    const u = this.meta.user;
    if (!u) return;
    document.getElementById("userAvatar").textContent = initials(u.nome);
    document.getElementById("userName").textContent = u.nome.trim().split(/\s+/)[0];
    document.getElementById("userPopName").textContent = u.nome;
    document.getElementById("userPopEmail").textContent = u.email;
    document.getElementById("userPopRole").textContent =
      u.papel === "admin" ? "Administrador" : u.perfil ? `Perfil: ${u.perfil}` : "Acesso personalizado";
    document.getElementById("userMenu").hidden = false;
  },

  /* ---------------- NAVEGAÇÃO ---------------- */
  async navigate(key, { replace = false } = {}){
    this.currentKey = key;
    if (!replace) history.pushState(null, "", key === "home" ? location.pathname : `#${key}`);
    document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.key === key));
    document.querySelector(".nav-home")?.classList.toggle("active", key === "home");
    document.body.classList.remove("nav-open");
    this.closePalette();

    const content = document.getElementById("content");
    const pill = document.getElementById("accessPill");
    const crumbs = document.getElementById("crumbs");
    pill.hidden = true;
    // desfaz a prévia de cor não salva da tela de Configurações
    if (this.meta.config) document.documentElement.dataset.accent = this.meta.config.corDestaque;

    if (key === "home"){
      crumbs.innerHTML = `<span>${esc(this.brand)}</span>`;
      document.getElementById("viewTitle").textContent = "Visão geral";
      document.title = this.brand;
      content.className = "content content-home";
      renderHomeView(content, this.meta);
      return;
    }

    const found = this.findItem(key);
    if (!found) return this.navigate("home", { replace: true });
    // o grupo da tela aberta fica sempre expandido no menu
    const g = document.querySelector(`.nav-group[data-group="${CSS.escape(found.group.key)}"]`);
    if (g?.classList.contains("collapsed")) this.setGroupOpen(g, true);
    document.querySelector(`.nav-item[data-key="${CSS.escape(key)}"]`)?.scrollIntoView({ block: "nearest" });

    content.className = "content";
    crumbs.innerHTML = `<a href="#" data-home>${esc(this.brand)}</a><span class="sep">/</span><span>${esc(found.group.label)}</span>`;
    crumbs.querySelector("[data-home]").addEventListener("click", (e) => { e.preventDefault(); this.navigate("home"); });
    document.getElementById("viewTitle").textContent = found.item.label;
    document.title = `${found.item.label} · ${this.brand}`;
    pill.hidden = !isConsulta(found.item);
    await this.renderModule(content, found.item);
  },

  renderModule(container, item){
    const views = {
      table: renderTableView, kanban: renderKanbanView, report: renderReportView,
      indicators: renderIndicatorsView, "sla-dashboard": renderSlaDashboardView, week: renderWeekView,
      users: renderUsersView, profiles: renderProfilesView, activity: renderActivityView, settings: renderSettingsView,
    };
    const view = views[item.type];
    if (!view){ container.innerHTML = `<div class="empty-state">Tela não implementada.</div>`; return; }
    return view(container, item);
  },

  /* ---------------- BUSCA RÁPIDA (Ctrl+K) ---------------- */
  openPalette(){
    const box = document.getElementById("palette");
    const input = document.getElementById("paletteInput");
    const list = document.getElementById("paletteList");
    const telas = [{ key: "home", label: "Visão geral", grupo: "Início", icon: "home" },
      ...this.meta.groups.flatMap(g => g.items.map(i => ({ key: i.key, label: i.label, grupo: g.label, icon: i.icon, desc: i.desc })))];
    const norm = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    let sel = 0;
    let achados = telas;

    const draw = () => {
      const q = norm(input.value.trim());
      // nome que começa com o termo > nome que contém > grupo/descrição que contém
      const nota = (t) => norm(t.label).startsWith(q) ? 0 : norm(t.label).includes(q) ? 1 : norm(`${t.grupo} ${t.desc ?? ""}`).includes(q) ? 2 : 9;
      achados = q ? telas.filter(t => nota(t) < 9).sort((a, b) => nota(a) - nota(b)) : telas;
      sel = Math.min(sel, Math.max(0, achados.length - 1));
      list.innerHTML = achados.length
        ? achados.map((t, i) => `<li role="option" aria-selected="${i === sel}" data-key="${esc(t.key)}" class="${i === sel ? "sel" : ""}">
            ${iconSVG(t.icon)}<span class="pl-label">${esc(t.label)}</span><span class="pl-group">${esc(t.grupo)}</span></li>`).join("")
        : `<li class="pl-empty">Nenhuma tela encontrada</li>`;
      list.querySelector(".sel")?.scrollIntoView({ block: "nearest" });
    };
    input.oninput = () => { sel = 0; draw(); };
    input.onkeydown = (e) => {
      if (e.key === "ArrowDown"){ e.preventDefault(); sel = (sel + 1) % Math.max(1, achados.length); draw(); }
      else if (e.key === "ArrowUp"){ e.preventDefault(); sel = (sel - 1 + achados.length) % Math.max(1, achados.length); draw(); }
      else if (e.key === "Enter" && achados[sel]){ e.preventDefault(); this.navigate(achados[sel].key); }
    };
    list.onclick = (e) => { const li = e.target.closest("[data-key]"); if (li) this.navigate(li.dataset.key); };
    input.value = "";
    draw();
    box.hidden = false;
    input.focus();
  },

  closePalette(){ document.getElementById("palette").hidden = true; },

  /* ---------------- CONFIRMAÇÃO ---------------- */
  /* await App.confirm({ title, message, confirmLabel, danger }) → true/false */
  confirm({ title = "Confirmar", message = "", confirmLabel = "Confirmar", danger = false } = {}){
    const box = document.getElementById("confirmBox");
    box.querySelector("#confirmTitle").textContent = title;
    box.querySelector("#confirmMsg").textContent = message;
    const ok = box.querySelector("#confirmOk");
    ok.textContent = confirmLabel;
    ok.className = `btn ${danger ? "btn-danger" : "btn-primary"}`;
    box.hidden = false;
    ok.focus();
    return new Promise((resolve) => {
      const done = (v) => {
        box.hidden = true;
        box.onclick = null;
        document.removeEventListener("keydown", onKey, true);
        resolve(v);
      };
      const onKey = (e) => { if (e.key === "Escape"){ e.stopPropagation(); done(false); } };
      document.addEventListener("keydown", onKey, true);
      box.onclick = (e) => {
        if (e.target === box || e.target.closest("#confirmCancel")) done(false);
        else if (e.target.closest("#confirmOk")) done(true);
      };
    });
  },

  /* ---------------- MODAL DE FORMULÁRIO ---------------- */
  /* abre o modal vazio e devolve o <form> para quem for preenchê-lo */
  openModal(title, { wide = false } = {}){
    const form = document.getElementById("modalForm");
    document.getElementById("modalTitle").textContent = title;
    document.querySelector("#modalBackdrop .modal").classList.toggle("modal-wide", wide);
    form.onsubmit = null;
    form.innerHTML = "";
    document.getElementById("modalBackdrop").classList.add("open");
    return form;
  },

  async openFormModal({ title, fields, onSubmit, initialValues, onDelete }){
    // formulários longos (ex.: Colaboradores) usam duas colunas
    const grid = fields.length > 8;
    const form = this.openModal(title, { wide: grid });
    form.innerHTML = loadingHTML("Carregando formulário…");

    // carrega as listas das chaves estrangeiras antes de montar o formulário
    const lookups = {};
    try {
      await Promise.all(fields.filter(f => f.type === "ref").map(async f => { lookups[f.ref] = await API.lookup(f.ref); }));
    } catch(err){
      form.innerHTML = errorHTML(err);
      return;
    }

    const init = initialValues || {};
    const campos = fields.map(f => this.fieldHTML(f, init[f.key], lookups)).join("");
    form.innerHTML = (grid ? `<div class="form-grid">${campos}</div>` : campos)
      + `<p class="form-error" id="formError" hidden></p>`
      + `<div class="modal-actions">`
      + (onDelete ? `<button type="button" class="modal-delete" id="modalDeleteBtn">Excluir</button>` : "")
      + `<span class="modal-spacer"></span>`
      + `<button type="button" class="btn" id="modalCancel">Cancelar</button>`
      + `<button type="submit" class="btn btn-primary modal-submit">Salvar</button></div>`;

    const errorEl = form.querySelector("#formError");
    const submitBtn = form.querySelector(".modal-submit");
    const showError = (msg) => { errorEl.textContent = msg; errorEl.hidden = false; };
    form.querySelector("#modalCancel").addEventListener("click", () => this.closeModal());

    form.onsubmit = async (e) => {
      e.preventDefault();
      errorEl.hidden = true;
      const values = {};
      for (const f of fields){
        const el = form.elements.namedItem(f.key);
        const raw = el.value.trim();
        switch (f.type){
          case "password": values[f.key] = el.value; break;
          case "number": values[f.key] = raw === "" ? null : Number(raw); break;
          case "bool": values[f.key] = raw === "true"; break;
          case "datetime": values[f.key] = raw ? new Date(raw).toISOString() : null; break;
          default: values[f.key] = raw === "" ? null : raw;   // ref (UUID), textos, datas
        }
      }
      submitBtn.disabled = true;
      submitBtn.textContent = "Salvando…";
      try {
        await onSubmit(values);
        this.closeModal();
      } catch(err){
        showError(err.message);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Salvar";
      }
    };

    form.querySelector("#modalDeleteBtn")?.addEventListener("click", async () => {
      if (!(await this.confirm({ title: "Excluir registro", message: "Essa ação não pode ser desfeita.", confirmLabel: "Excluir", danger: true }))) return;
      try {
        await onDelete();
        this.closeModal();
      } catch(err){ showError(err.message); }
    });

    form.querySelector("input,select")?.focus();
  },

  fieldHTML(f, current, lookups){
    const id = `f_${f.key}`;
    const req = f.required ? "required" : "";
    const star = f.required ? ` <span class="req">*</span>` : "";
    const hint = f.hint ? `<small class="field-hint">${esc(f.hint)}</small>` : "";
    const wrap = (control) => `<div class="field"><label for="${id}">${esc(f.label)}${star}</label>${control}${hint}</div>`;
    const opts = (list, selected) => list.map(o =>
      `<option value="${esc(o.value)}" ${String(o.value) === String(selected ?? "") ? "selected" : ""}>${esc(o.label)}</option>`).join("");

    switch (f.type){
      case "ref":
        return wrap(`<select id="${id}" name="${esc(f.key)}" ${req}>
          <option value="">${f.required ? "Selecione…" : "— nenhum —"}</option>
          ${opts(lookups[f.ref] || [], current)}</select>`);
      case "select":
        return wrap(`<select id="${id}" name="${esc(f.key)}" ${req}>${opts(f.options, current)}</select>`);
      case "status":
        return wrap(`<select id="${id}" name="${esc(f.key)}" ${req}>
          ${f.required ? `<option value="">Selecione…</option>` : `<option value="">—</option>`}
          ${opts((f.options || []).map(o => ({ value:o, label:o })), current)}</select>`);
      case "bool":
        return wrap(`<select id="${id}" name="${esc(f.key)}">
          ${opts([{ value:"true", label:"Ativo" }, { value:"false", label:"Inativo" }], current === undefined ? "true" : String(current))}</select>`);
      case "number":
        return wrap(`<input id="${id}" name="${esc(f.key)}" type="number" step="1" value="${esc(current ?? "")}" ${req}>`);
      case "money":
        return wrap(`<input id="${id}" name="${esc(f.key)}" type="number" step="0.01" min="0" inputmode="decimal" value="${esc(current ?? "")}" placeholder="0,00" ${req}>`);
      case "date":
        return wrap(`<input id="${id}" name="${esc(f.key)}" type="date" value="${esc(current ?? "")}" ${req}>`);
      case "datetime":
        return wrap(`<input id="${id}" name="${esc(f.key)}" type="datetime-local" value="${esc(toLocalInput(current))}" ${req}>`);
      case "month":
        return wrap(`<input id="${id}" name="${esc(f.key)}" type="month" value="${esc(current ?? "")}" ${req}>`);
      case "time":
        return wrap(`<input id="${id}" name="${esc(f.key)}" type="time" value="${esc(current ?? "")}" ${req}>`);
      case "password":
        return wrap(`<input id="${id}" name="${esc(f.key)}" type="password" autocomplete="new-password" ${req}>`);
      case "hours":
        return wrap(`<input id="${id}" name="${esc(f.key)}" type="text" value="${esc(current ?? "")}" placeholder="ex: +3h20, -1h30, 45min" ${req}>`);
      default:
        return wrap(`<input id="${id}" name="${esc(f.key)}" type="text" maxlength="500" value="${esc(current ?? "")}" ${req}>`);
    }
  },

  closeModal(){
    document.getElementById("modalBackdrop").classList.remove("open");
  },

  /* ---------------- TEMA CLARO / ESCURO ---------------- */
  setTheme(theme){
    document.documentElement.dataset.theme = theme;
    this.syncThemeUI();
  },

  syncThemeUI(){
    const light = document.documentElement.dataset.theme === "light";
    document.getElementById("themeToggle").setAttribute("aria-pressed", String(light));
    document.getElementById("themeToggle").title = light ? "Mudar para tema escuro" : "Mudar para tema claro";
    document.querySelector('meta[name="theme-color"]').setAttribute("content", light ? "#F4F6FB" : "#090E1A");
  },

  wireGlobalEvents(){
    document.getElementById("modalClose").addEventListener("click", () => this.closeModal());
    document.getElementById("modalBackdrop").addEventListener("mousedown", (e) => {
      if (e.target.id === "modalBackdrop") this.closeModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape"){ this.closeModal(); this.closePalette(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k" && this.meta){ e.preventDefault(); this.openPalette(); }
    });
    document.getElementById("navToggle").addEventListener("click", () => document.body.classList.toggle("nav-open"));
    document.getElementById("searchBtn").addEventListener("click", () => this.meta && this.openPalette());
    document.getElementById("palette").addEventListener("mousedown", (e) => { if (e.target.id === "palette") this.closePalette(); });
    if (/Mac|iPhone|iPad/.test(navigator.platform)) document.getElementById("searchKbd").textContent = "⌘K";

    this.syncThemeUI();
    document.getElementById("themeToggle").addEventListener("click", () => {
      const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
      this.setTheme(next);
      try { localStorage.setItem("theme", next); } catch {}
    });
    // segue o sistema enquanto o usuário não escolher manualmente
    matchMedia("(prefers-color-scheme: light)").addEventListener("change", (e) => {
      let saved = null;
      try { saved = localStorage.getItem("theme"); } catch {}
      if (!saved) this.setTheme(e.matches ? "light" : "dark");
    });

    const chip = document.getElementById("userChip");
    const pop = document.getElementById("userPop");
    const setPop = (open) => { pop.hidden = !open; chip.setAttribute("aria-expanded", String(open)); };
    chip.addEventListener("click", (e) => { e.stopPropagation(); setPop(pop.hidden); });
    document.addEventListener("click", (e) => { if (!pop.hidden && !pop.contains(e.target)) setPop(false); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") setPop(false); });

    document.getElementById("logoutBtn").addEventListener("click", async () => {
      try { await API.post("/auth/logout"); } catch {}
      location.replace("/login.html");
    });

    document.getElementById("changePassword").addEventListener("click", () => {
      setPop(false);
      this.openFormModal({
        title: "Alterar senha",
        fields: [
          { key: "atual", label: "Senha atual", type: "password", required: true },
          { key: "nova", label: "Nova senha", type: "password", required: true, hint: "Mínimo de 8 caracteres. Os outros dispositivos serão desconectados." },
          { key: "confirma", label: "Confirmar nova senha", type: "password", required: true },
        ],
        onSubmit: async (v) => {
          if (v.nova !== v.confirma) throw new Error("As senhas não conferem");
          await API.post("/auth/senha", { atual: v.atual, nova: v.nova });
          toast("Senha alterada");
        },
      });
    });

    document.getElementById("resetData").addEventListener("click", async () => {
      if (!(await this.confirm({ title: "Restaurar dados de exemplo", message: "Isso APAGA todos os dados do banco e grava os dados de exemplo.", confirmLabel: "Apagar e restaurar", danger: true }))) return;
      const content = document.getElementById("content");
      content.innerHTML = loadingHTML("Restaurando dados de exemplo…");
      try {
        await API.post("/admin/reset");
        API.clearLookups();
        toast("Dados de exemplo restaurados");
      } catch(err){ toast(err.message, "bad"); }
      await this.navigate(this.currentKey, { replace: true });
      await this.refreshNavCounts();
    });
  },
};

document.addEventListener("DOMContentLoaded", () => App.init());
