/* =========================================================
   Tela inicial: visão geral
   Indicadores e pendências vêm de /api/resumo/geral, que só
   devolve os blocos das telas que o usuário pode ver.
   ========================================================= */

/* cartões de indicador: [bloco, tela de destino, rótulo, valor, detalhe, tom] */
function homeKpis(b){
  const k = [];
  if (b.pessoas) k.push(["colaboradores", "Colaboradores ativos", b.pessoas.ativos, b.pessoas.setores ? `${b.pessoas.setores} setor(es)` : "", "indigo"]);
  if (b.contrato) {
    const pct = b.contrato.equipeMinima ? Math.round((b.contrato.ocupados / b.contrato.equipeMinima) * 100) : 100;
    k.push(["cargos-salarios", "Cobertura do contrato", `${pct}%`,
      `${b.contrato.ocupados} de ${b.contrato.equipeMinima} vagas mínimas`, pct >= 100 ? "green" : pct >= 80 ? "amber" : "red"]);
  }
  if (b.ferias) k.push(["ferias", "Em férias hoje", b.ferias.emFerias, b.ferias.proximas ? `${b.ferias.proximas} saem nos próximos 7 dias` : "nenhuma saída nos próximos 7 dias", "blue"]);
  if (b.afastamentos) k.push(["afastamentos", "Afastamentos ativos", b.afastamentos.ativos, "atestados e licenças", b.afastamentos.ativos ? "amber" : "green"]);
  if (b.os) k.push(["controle-os", "OS abertas", b.os.abertas, b.os.atrasadas ? `${b.os.atrasadas} fora do prazo` : "todas no prazo", b.os.atrasadas ? "red" : "green"]);
  if (b.sla) k.push(["dashboards-sla", "Chamados abertos", b.sla.abertos,
    b.sla.atrasados || b.sla.risco ? `${b.sla.atrasados} atrasado(s) · ${b.sla.risco} em risco` : "todos no prazo", b.sla.atrasados ? "red" : b.sla.risco ? "amber" : "green"]);
  if (b.financeiro) k.push(["faturamento", "A receber", fmtMoney(b.financeiro.aReceber),
    b.financeiro.vencido ? `${fmtMoney(b.financeiro.vencido)} vencido` : "nada vencido", b.financeiro.vencido ? "red" : "green"]);
  return k;
}

async function renderHomeView(container, meta){
  const h = new Date().getHours();
  const saudacao = h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
  const primeiro = meta.user ? meta.user.nome.trim().split(/\s+/)[0] : "";
  const grupos = meta.groups.filter(g => g.key !== "admin");
  const telas = grupos.reduce((n, g) => n + g.items.length, 0);
  const hoje = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });

  container.innerHTML = `
    <div class="home-screen">
      <div class="home-header">
        <span class="eyebrow">${esc(hoje)}</span>
        <h1>${saudacao}${primeiro ? `, ${esc(primeiro)}` : ""}</h1>
        <p>${telas
          ? `Este é o resumo do que está acontecendo nas ${telas} tela(s) que você acompanha.`
          : "Seu acesso ainda não inclui nenhuma tela. Fale com o administrador do painel."}</p>
      </div>
      <div id="homeResumo">${telas ? loadingHTML("Calculando indicadores…") : ""}</div>
      ${grupos.length ? `
        <section class="home-section">
          <div class="section-title"><h2>Acesso rápido</h2></div>
          ${grupos.map(group => `
            <div class="home-group">
              <div class="home-group-title">${esc(group.label)}</div>
              <div class="quick-grid">
                ${group.items.map(item => `
                  <button class="quick-card" data-key="${esc(item.key)}">
                    <span class="home-icon acc-${esc(item.accent)}">${iconSVG(item.icon)}</span>
                    <span class="quick-text"><strong>${esc(item.label)}</strong><small>${esc(item.desc)}</small></span>
                    ${isConsulta(item) ? `<span class="home-tag" title="Somente consulta">${iconSVG("eye")}</span>` : ""}
                  </button>`).join("")}
              </div>
            </div>`).join("")}
        </section>` : ""}
    </div>`;

  container.querySelectorAll("[data-key]").forEach(el => el.addEventListener("click", () => App.navigate(el.dataset.key)));
  if (!telas && meta.user?.papel !== "admin") return;

  let r;
  try { r = await API.get("/resumo/geral"); }
  catch(err){ container.querySelector("#homeResumo").innerHTML = errorHTML(err); return; }
  if (App.currentKey !== "home") return;   // usuário já saiu da tela

  const kpis = homeKpis(r.blocos);
  const pode = (key) => !!App.findItem(key);
  const MOD = { pessoas: "Pessoas", os: "OS", sla: "SLA" };

  container.querySelector("#homeResumo").innerHTML = `
    ${kpis.length ? `<div class="stat-grid">
      ${kpis.map(([key, label, valor, detalhe, tom]) => `
        <button class="stat-card tone-${tom}" data-key="${esc(key)}">
          <span class="stat-label">${esc(label)}</span>
          <span class="stat-value">${esc(valor)}</span>
          <span class="stat-detail">${esc(detalhe)}</span>
        </button>`).join("")}
    </div>` : ""}
    <div class="home-columns">
      <section class="panel home-panel">
        <div class="panel-head"><div><h2>Precisa de atenção</h2><p>Itens calculados agora a partir dos cadastros</p></div></div>
        ${r.pendencias.length ? `<ul class="todo-list">
          ${r.pendencias.map(p => `
            <li><button class="todo-item" ${pode(p.tela) ? `data-key="${esc(p.tela)}"` : "disabled"}>
              <span class="todo-dot tone-${p.tom}"></span><span>${esc(p.texto)}</span>
              ${pode(p.tela) ? `<span class="todo-go">${iconSVG("chevron")}</span>` : ""}
            </button></li>`).join("")}
        </ul>` : `<div class="empty-state">${iconSVG("check", "empty-ic ok")}<strong>Tudo em dia</strong><span>Nenhuma pendência nas telas que você acompanha.</span></div>`}
      </section>
      ${r.proximosEventos ? `
      <section class="panel home-panel">
        <div class="panel-head"><div><h2>Próximos eventos</h2><p>Da agenda da equipe</p></div>
          <button class="btn btn-ghost btn-sm" data-key="eventos-semana">Ver agenda</button></div>
        ${r.proximosEventos.length ? `<ul class="event-list">
          ${r.proximosEventos.map(e => {
            const d = new Date(e.inicio);
            return `<li>
              <span class="event-date"><strong>${d.getDate()}</strong>${d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}</span>
              <span class="event-body"><strong>${esc(e.titulo)}</strong>
                <small>${d.toLocaleDateString("pt-BR", { weekday: "long" })}, ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}${e.modulo ? ` · ${MOD[e.modulo]}` : ""}</small></span>
            </li>`;
          }).join("")}
        </ul>` : `<div class="empty-state"><strong>Agenda livre</strong><span>Nenhum evento futuro cadastrado.</span></div>`}
      </section>` : ""}
    </div>`;

  container.querySelectorAll("#homeResumo [data-key]").forEach(el => el.addEventListener("click", () => App.navigate(el.dataset.key)));
}
