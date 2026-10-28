/* =========================================================
   Tela: tabela genérica (dirigida pelas colunas de /api/meta)
   - indicadores por status, filtros, busca
   - ordenação por coluna, paginação, exportação CSV
   ========================================================= */

function cellText(col, row){
  const v = row[col.key];
  switch (col.type){
    case "ref":
    case "month": return row._labels?.[col.key] ?? "—";
    case "date": return fmtDate(v);
    case "datetime": return fmtDateTime(v);
    case "money": return fmtMoney(v);
    case "bool": return v ? "Ativo" : "Inativo";
    default: return v ?? "—";
  }
}

function cellHTML(col, row){
  const text = cellText(col, row);
  if (col.type === "status" || col.type === "bool") return badgeHTML(text);
  if (["date","datetime","number","money","hours","month"].includes(col.type)) return `<span class="mono">${esc(text)}</span>`;
  if (col.computed && col.type === "text") return `<span class="t-${classifyStatus(text)}">${esc(text)}</span>`;
  return esc(text);
}

/* valor usado para ordenar: datas/números pelo valor real, textos sem acento */
function sortValue(col, row){
  const v = row[col.key];
  if (v === null || v === undefined || v === "") return null;
  switch (col.type){
    case "number": case "money": return Number(v);
    case "date": case "datetime": case "month": return String(v);
    case "bool": return v ? 1 : 0;
    case "hours": {
      const m = String(v).match(/^([+-])?(\d+)h(\d+)?/);
      return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0)) : 0;
    }
    default: return String(cellText(col, row)).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  }
}

function accentForKind(kind){
  return { ok:"green", warn:"amber", bad:"red", info:"blue" }[kind] || "";
}

function buildKpiRow(rows, statusCol){
  const tiles = [`<div class="kpi kpi-total"><div class="value">${rows.length}</div><div class="label">Total</div></div>`];
  if (statusCol){
    const counts = new Map();
    rows.forEach(r => {
      const label = cellText(statusCol, r);
      counts.set(label, (counts.get(label) || 0) + 1);
    });
    [...counts.entries()].sort((a,b) => b[1]-a[1]).slice(0, 5).forEach(([label, count]) => {
      tiles.push(`<div class="kpi accent-${accentForKind(classifyStatus(label))}"><div class="value">${count}</div><div class="label">${esc(label)}</div></div>`);
    });
  }
  return `<div class="kpi-row">${tiles.join("")}</div>`;
}

function detectFilterColumns(rows, columns){
  return columns
    .filter(c => ["status","bool","ref"].includes(c.type) || c.filter)
    .map(col => ({ col, values: [...new Set(rows.map(r => cellText(col, r)))].sort((a,b)=>String(a).localeCompare(String(b))) }))
    .filter(f => f.values.length > 1 && f.values.length <= (f.col.filter ? 40 : 15))
    .slice(0, 4);
}

/* estado da tabela por tela (ordenação, página, filtros) sobrevive a recarregar os dados */
const tableState = {};
const PAGE_SIZES = [25, 50, 100];

async function renderTableView(container, item){
  container.innerHTML = loadingHTML();
  let rows;
  try { rows = await API.get(`/modules/${item.key}`); }
  catch(err){ container.innerHTML = errorHTML(err); return; }

  const st = tableState[item.key] ??= { sort: null, dir: 1, page: 1, size: 25, search: "", filters: {} };
  const visible = item.columns.filter(c => c.table);
  const statusCol = visible.find(c => c.key === "status") || visible.find(c => c.type === "status" || c.type === "bool");
  const filterCols = detectFilterColumns(rows, visible);
  // colunas de texto com valores longos quebram linha em vez de alargar a tabela
  const longCols = new Set(visible.filter(c => c.type === "text" && rows.some(r => String(cellText(c, r)).length > 32)).map(c => c.key));
  const editable = !item.readOnly && item.nivel !== "ver";
  const numeric = (c) => ["number","money","hours"].includes(c.type);
  let filtered = rows;

  container.innerHTML = `
    ${buildKpiRow(rows, statusCol)}
    <div class="panel table-panel">
      <div class="panel-head">
        <div>
          <h2>${esc(item.label)}</h2>
          <p id="rowCountLabel"></p>
        </div>
        <div class="panel-actions">
          ${item.key === "colaboradores" && App.meta.user?.papel === "admin"
            ? `<button class="btn btn-ghost" id="importBtn" title="Criar ou atualizar colaboradores a partir de uma planilha">${iconSVG("upload")}Importar</button>` : ""}
          <button class="btn btn-ghost" id="exportBtn" title="Baixar as linhas filtradas em CSV (abre no Excel)">${iconSVG("download")}Exportar</button>
          ${editable
            ? `<button class="btn btn-primary" id="addRowBtn">${iconSVG("plus")}Adicionar</button>`
            : `<span class="readonly-note">${item.readOnly ? "Calculado automaticamente" : "Somente consulta"}</span>`}
        </div>
      </div>
      <div class="toolbar">
        <div class="toolbar-search">
          ${iconSVG("search")}
          <input type="search" id="searchInput" placeholder="Buscar em ${esc(item.label.toLowerCase())}…" value="${esc(st.search)}" aria-label="Buscar">
        </div>
        ${filterCols.map(f => `
          <label class="toolbar-filter">
            <span>${esc(f.col.label)}</span>
            <select data-filter-col="${esc(f.col.key)}">
              <option value="">Todos</option>
              ${f.values.map(v => `<option value="${esc(v)}" ${st.filters[f.col.key] === String(v) ? "selected" : ""}>${esc(v)}</option>`).join("")}
            </select>
          </label>`).join("")}
        <button type="button" class="btn btn-ghost btn-sm" id="clearFilters" hidden>Limpar filtros</button>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr>
            ${visible.map(c => `<th class="${numeric(c) ? "num " : ""}sortable" data-sort="${esc(c.key)}" tabindex="0" aria-sort="none">
              <span>${esc(c.label)}</span><i class="sort-ic" aria-hidden="true"></i></th>`).join("")}
            ${editable ? `<th class="col-actions"><span class="sr-only">Ações</span></th>` : ""}
          </tr></thead>
          <tbody id="tableBody"></tbody>
        </table>
      </div>
      <div class="pager" id="pager"></div>
    </div>
  `;

  const searchEl = container.querySelector("#searchInput");
  const selects = [...container.querySelectorAll("[data-filter-col]")];
  const clearBtn = container.querySelector("#clearFilters");

  function apply(){
    const search = st.search.trim().toLowerCase();
    const active = Object.entries(st.filters).filter(([, v]) => v).map(([k, v]) => [visible.find(c => c.key === k), v]).filter(([c]) => c);
    filtered = rows.filter(row => {
      if (search && !visible.map(c => String(cellText(c, row))).join(" ").toLowerCase().includes(search)) return false;
      return active.every(([col, val]) => String(cellText(col, row)) === val);
    });
    const sortCol = visible.find(c => c.key === st.sort);
    if (sortCol){
      filtered = [...filtered].sort((a, b) => {
        const va = sortValue(sortCol, a), vb = sortValue(sortCol, b);
        if (va === null && vb === null) return 0;
        if (va === null) return 1;               // vazios sempre no fim
        if (vb === null) return -1;
        return (va < vb ? -1 : va > vb ? 1 : 0) * st.dir;
      });
    }
    clearBtn.hidden = !search && !active.length;
    return active.length + (search ? 1 : 0);
  }

  function openEditor(row){
    App.openFormModal({
      title: row ? `Editar — ${item.label}` : `Novo registro — ${item.label}`,
      fields: item.columns.filter(c => !c.computed),
      initialValues: row,
      onSubmit: async (values) => {
        if (row) await API.put(`/modules/${item.key}/${row.id}`, values);
        else await API.post(`/modules/${item.key}`, values);
        toast(row ? "Registro atualizado" : "Registro criado");
        await afterChange();
      },
      onDelete: row ? async () => {
        await API.del(`/modules/${item.key}/${row.id}`);
        toast("Registro excluído");
        await afterChange();
      } : null,
    });
  }

  function draw(){
    const nFiltros = apply();
    const pages = Math.max(1, Math.ceil(filtered.length / st.size));
    st.page = Math.min(Math.max(1, st.page), pages);
    const start = (st.page - 1) * st.size;
    const pageRows = filtered.slice(start, start + st.size);

    container.querySelectorAll("th.sortable").forEach(th => {
      const on = th.dataset.sort === st.sort;
      th.classList.toggle("sorted", on);
      th.classList.toggle("desc", on && st.dir < 0);
      th.setAttribute("aria-sort", on ? (st.dir > 0 ? "ascending" : "descending") : "none");
    });

    const tbody = container.querySelector("#tableBody");
    tbody.innerHTML = pageRows.length
      ? pageRows.map(row => `
          <tr data-row="${esc(row.id)}"${editable ? ` class="is-clickable"` : ""}>
            ${visible.map(c => `<td class="${longCols.has(c.key) ? "td-text" : ""}${numeric(c) ? " num" : ""}">${cellHTML(c, row)}</td>`).join("")}
            ${editable ? `<td class="col-actions"><button class="icon-btn" data-edit="${esc(row.id)}" aria-label="Editar">${iconSVG("pencil")}Editar</button></td>` : ""}
          </tr>`).join("")
      : `<tr><td colspan="${visible.length + 1}"><div class="empty-state">
          ${iconSVG("search", "empty-ic")}<strong>Nenhum registro encontrado</strong>
          <span>${nFiltros ? "Ajuste a busca ou limpe os filtros." : editable ? "Clique em Adicionar para criar o primeiro." : "Ainda não há registros."}</span>
        </div></td></tr>`;

    container.querySelector("#rowCountLabel").textContent = nFiltros
      ? `${filtered.length} de ${rows.length} registro(s) · ${nFiltros} filtro(s) ativo(s)`
      : `${rows.length} registro(s)`;

    const pager = container.querySelector("#pager");
    pager.hidden = filtered.length <= PAGE_SIZES[0];
    pager.innerHTML = `
      <span class="pager-info">${filtered.length ? `${start + 1}–${start + pageRows.length} de ${filtered.length}` : "0"}</span>
      <label class="pager-size">Por página
        <select id="pageSize">${PAGE_SIZES.map(n => `<option ${n === st.size ? "selected" : ""}>${n}</option>`).join("")}</select>
      </label>
      <div class="pager-nav">
        <button class="icon-btn" data-page="prev" ${st.page <= 1 ? "disabled" : ""} aria-label="Página anterior">‹</button>
        <span>${st.page} / ${pages}</span>
        <button class="icon-btn" data-page="next" ${st.page >= pages ? "disabled" : ""} aria-label="Próxima página">›</button>
      </div>`;
    pager.querySelector("#pageSize").addEventListener("change", (e) => { st.size = Number(e.target.value); st.page = 1; draw(); });
    pager.querySelectorAll("[data-page]").forEach(b => b.addEventListener("click", () => {
      st.page += b.dataset.page === "next" ? 1 : -1;
      draw();
      container.querySelector(".table-panel").scrollIntoView({ block: "start", behavior: "smooth" });
    }));

    tbody.querySelectorAll("[data-edit]").forEach(btn => btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openEditor(rows.find(r => r.id === btn.dataset.edit));
    }));
    if (editable) tbody.querySelectorAll("tr[data-row]").forEach(tr => tr.addEventListener("dblclick", () => {
      openEditor(rows.find(r => r.id === tr.dataset.row));
    }));
  }

  async function afterChange(){
    API.clearLookups();
    await renderTableView(container, item);
    App.refreshNavCounts();
  }

  container.querySelectorAll("th.sortable").forEach(th => {
    const toggle = () => {
      if (st.sort === th.dataset.sort) st.dir = -st.dir;
      else { st.sort = th.dataset.sort; st.dir = 1; }
      draw();
    };
    th.addEventListener("click", toggle);
    th.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " "){ e.preventDefault(); toggle(); } });
  });

  let debounce;
  searchEl.addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => { st.search = searchEl.value; st.page = 1; draw(); }, 120);
  });
  selects.forEach(sel => sel.addEventListener("change", () => { st.filters[sel.dataset.filterCol] = sel.value; st.page = 1; draw(); }));
  clearBtn.addEventListener("click", () => {
    st.search = ""; st.filters = {}; st.page = 1;
    searchEl.value = "";
    selects.forEach(s => { s.value = ""; });
    draw();
  });

  container.querySelector("#exportBtn").addEventListener("click", () => {
    const hoje = new Date().toISOString().slice(0, 10);
    downloadCSV(`${item.key}-${hoje}.csv`, visible.map(c => c.label), filtered.map(row => visible.map(c => cellText(c, row))));
  });
  container.querySelector("#importBtn")?.addEventListener("click", () => openImportModal(afterChange));
  container.querySelector("#addRowBtn")?.addEventListener("click", () => openEditor(null));

  draw();
}
