/* Telas calculadas: relatório por cliente e indicadores de OS/financeiro. */

/* =========================================================
   RELATÓRIOS — consolidado por cliente
   ========================================================= */
async function renderReportView(container, item){
  const tela = App.currentKey;
  container.innerHTML = loadingHTML();
  let rows;
  try { rows = await API.get("/resumo/clientes"); }
  catch(err){ container.innerHTML = errorHTML(err); return; }

  const tot = rows.reduce((a, r) => ({
    faturado: a.faturado + r.faturado, emAberto: a.emAberto + r.emAberto,
    osAbertas: a.osAbertas + r.osAbertas, atrasados: a.atrasados + r.chamadosAtrasados,
  }), { faturado:0, emAberto:0, osAbertas:0, atrasados:0 });

  container.innerHTML = `
    <div class="kpi-row">
      <div class="kpi kpi-total"><div class="value">${rows.length}</div><div class="label">Clientes</div></div>
      <div class="kpi accent-blue"><div class="value">${tot.osAbertas}</div><div class="label">OS abertas</div></div>
      <div class="kpi"><div class="value value-sm">${fmtMoney(tot.faturado)}</div><div class="label">Faturado</div></div>
      <div class="kpi accent-amber"><div class="value value-sm">${fmtMoney(tot.emAberto)}</div><div class="label">A receber</div></div>
      <div class="kpi accent-red"><div class="value">${tot.atrasados}</div><div class="label">Chamados atrasados</div></div>
    </div>
    <div class="panel">
      <div class="panel-head"><div><h2>${esc(item.label)} por cliente</h2><p>Calculado a partir de OS, Faturamento e Chamados</p></div></div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Cliente</th><th>OS (total)</th><th>OS abertas</th><th>Faturado</th><th>A receber</th><th>Chamados abertos</th><th>Atrasados</th></tr></thead>
          <tbody>
            ${rows.map(r => `<tr>
              <td>${esc(r.cliente)}</td>
              <td><span class="mono">${r.osTotal}</span></td>
              <td><span class="mono">${r.osAbertas}</span></td>
              <td><span class="mono">${fmtMoney(r.faturado)}</span></td>
              <td><span class="mono">${fmtMoney(r.emAberto)}</span></td>
              <td><span class="mono">${r.chamadosAbertos}</span></td>
              <td>${r.chamadosAtrasados ? `<span class="badge bad">${r.chamadosAtrasados}</span>` : `<span class="mono">0</span>`}</td>
            </tr>`).join("") || `<tr><td colspan="7"><div class="empty-state">Sem clientes cadastrados.</div></td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;

  App.setExport(tela, () => ({
    titulo: `${item.label} por cliente`,
    subtitulo: "Calculado a partir de OS, Faturamento e Chamados",
    resumo: [
      ["Clientes", rows.length, "number"], ["OS abertas", tot.osAbertas, "number"],
      ["Faturado", tot.faturado, "money"], ["A receber", tot.emAberto, "money"],
      ["Chamados atrasados", tot.atrasados, "number"],
    ],
    colunas: [
      { label: "Cliente", type: "text" }, { label: "OS (total)", type: "number" }, { label: "OS abertas", type: "number" },
      { label: "Faturado", type: "money" }, { label: "A receber", type: "money" },
      { label: "Chamados abertos", type: "number" }, { label: "Chamados atrasados", type: "number" },
    ],
    linhas: rows.map(r => [r.cliente, r.osTotal, r.osAbertas, r.faturado, r.emAberto, r.chamadosAbertos, r.chamadosAtrasados]),
  }));
}

/* =========================================================
   INDICADORES — OS e financeiro
   ========================================================= */
async function renderIndicatorsView(container){
  const tela = App.currentKey;
  container.innerHTML = loadingHTML();
  let data;
  try { data = await API.get("/resumo/os"); }
  catch(err){ container.innerHTML = errorHTML(err); return; }
  const k = data.kpis;

  container.innerHTML = `
    <div class="kpi-row">
      <div class="kpi accent-blue"><div class="value">${k.osAbertas}</div><div class="label">OS abertas</div></div>
      <div class="kpi accent-green"><div class="value">${k.osConcluidas}</div><div class="label">OS concluídas</div></div>
      <div class="kpi accent-red"><div class="value">${k.osAtrasadas}</div><div class="label">OS fora do prazo</div></div>
      <div class="kpi"><div class="value">${k.osPorColaborador.toFixed(1)}</div><div class="label">OS abertas / colaborador</div></div>
    </div>
    <div class="kpi-row">
      <div class="kpi"><div class="value value-sm">${fmtMoney(k.faturado)}</div><div class="label">Faturado</div></div>
      <div class="kpi accent-green"><div class="value value-sm">${fmtMoney(k.recebido)}</div><div class="label">Recebido</div></div>
      <div class="kpi accent-amber"><div class="value value-sm">${fmtMoney(k.emAberto)}</div><div class="label">Em aberto</div></div>
      <div class="kpi accent-red"><div class="value value-sm">${fmtMoney(k.vencido)}</div><div class="label">Vencido</div></div>
    </div>
    <div class="panel">
      <div class="panel-head"><div><h2>Ordens de serviço</h2><p>Ordenadas por prazo</p></div></div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>OS</th><th>Cliente</th><th>Serviço</th><th>Responsável</th><th>Prazo</th><th>Status</th></tr></thead>
          <tbody>
            ${data.ordens.map(r => `<tr>
              <td><span class="mono">${esc(r.numero)}</span></td><td>${esc(r.cliente)}</td><td>${esc(r.servico)}</td>
              <td>${esc(r.responsavel)}</td>
              <td><span class="mono ${r.atrasada ? "t-bad" : ""}">${fmtDate(r.prazo)}</span></td>
              <td>${badgeHTML(r.atrasada ? `${r.status} · atrasada` : r.status)}</td>
            </tr>`).join("") || `<tr><td colspan="6"><div class="empty-state">Sem ordens de serviço cadastradas.</div></td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;

  App.setExport(tela, () => ({
    titulo: "Indicadores de ordens de serviço",
    subtitulo: "Ordens de serviço ordenadas por prazo",
    resumo: [
      ["OS abertas", k.osAbertas, "number"], ["OS concluídas", k.osConcluidas, "number"],
      ["OS fora do prazo", k.osAtrasadas, "number"], ["OS abertas por colaborador", k.osPorColaborador.toFixed(1).replace(".", ",")],
      ["Faturado", k.faturado, "money"], ["Recebido", k.recebido, "money"],
      ["Em aberto", k.emAberto, "money"], ["Vencido", k.vencido, "money"],
    ],
    colunas: [
      { label: "OS", type: "text" }, { label: "Cliente", type: "text" }, { label: "Serviço", type: "text" },
      { label: "Responsável", type: "text" }, { label: "Prazo", type: "date" }, { label: "Status", type: "text" },
      { label: "Situação", type: "text" },
    ],
    linhas: data.ordens.map(r => [r.numero, r.cliente, r.servico, r.responsavel, r.prazo, r.status, r.atrasada ? "Atrasada" : null]),
  }));
}
