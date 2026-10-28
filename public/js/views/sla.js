/* Tela: painel de SLA (medidor + chamados que precisam de atenção). */

/* =========================================================
   SLA DASHBOARD — medidor + lista de atenção
   ========================================================= */
async function renderSlaDashboardView(container){
  container.innerHTML = loadingHTML();
  let d;
  try { d = await API.get("/resumo/sla"); }
  catch(err){ container.innerHTML = errorHTML(err); return; }

  const emRisco = d.atencao + d.critico;
  const pct = d.abertos ? Math.round((d.noPrazo / d.abertos) * 100) : 100;
  const pct30 = d.concluidos30d ? Math.round((d.concluidosNoPrazo30d / d.concluidos30d) * 100) : null;

  const R = 70, CX = 90, CY = 90;
  const arc = 2 * Math.PI * R * 0.75;
  const dash = (pct / 100) * arc;
  const color = pct >= 80 ? "var(--green)" : pct >= 50 ? "var(--amber)" : "var(--red)";
  const atencao = d.rows.filter(r => r.status !== "No prazo");

  container.innerHTML = `
    <div class="sla-top">
      <div class="panel gauge-panel">
        <h2>Chamados abertos no prazo</h2>
        <div class="gauge-wrap">
          <svg class="gauge-svg" width="180" height="180" viewBox="0 0 180 180" role="img" aria-label="${pct}% no prazo">
            <circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="var(--surface-3)" stroke-width="14"
              stroke-dasharray="${arc} 999" stroke-linecap="round" transform="rotate(135 ${CX} ${CY})"/>
            <circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="${color}" stroke-width="14"
              stroke-dasharray="${dash} 999" stroke-linecap="round" transform="rotate(135 ${CX} ${CY})"/>
          </svg>
          <div class="gauge-center"><div class="gauge-value">${pct}%</div><small>no prazo</small></div>
        </div>
        <div class="gauge-caption">${d.noPrazo} de ${d.abertos} chamados abertos com folga</div>
        <div class="gauge-legend">
          <span><span class="dot" style="background:var(--green)"></span>No prazo (${d.noPrazo})</span>
          <span><span class="dot" style="background:var(--amber)"></span>Em risco (${emRisco})</span>
          <span><span class="dot" style="background:var(--red)"></span>Atrasado (${d.atrasado})</span>
        </div>
        <div class="gauge-foot">${pct30 === null ? "Nenhum chamado concluído nos últimos 30 dias" : `Últimos 30 dias: <strong>${pct30}%</strong> concluídos dentro do SLA (${d.concluidosNoPrazo30d}/${d.concluidos30d})`}</div>
      </div>

      <div class="panel risk-list">
        <h2>Chamados que precisam de atenção agora</h2>
        ${atencao.map(r => `
          <div class="risk-row">
            ${badgeHTML(r.status)}
            <span class="ri-name">${esc(r.chamado)} · ${esc(r.cliente)}<small>${esc(r.responsavel)}</small></span>
            <span class="ri-time">${esc(r.tempoRestante)}</span>
          </div>
        `).join("") || `<div class="empty-state">Nenhum chamado em risco no momento.</div>`}
      </div>
    </div>

    <div class="panel">
      <div class="panel-head"><div><h2>Todos os chamados abertos</h2><p>Atualize a página para recalcular o tempo restante</p></div>
        <button class="btn" data-go="chamados-risco">Gerenciar chamados →</button></div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Chamado</th><th>Cliente</th><th>Responsável</th><th>Prazo</th><th>Tempo restante</th><th>Risco</th></tr></thead>
          <tbody>
            ${d.rows.map(r => `<tr>
              <td><span class="mono">${esc(r.chamado)}</span></td><td>${esc(r.cliente)}</td><td>${esc(r.responsavel)}</td>
              <td><span class="mono">${fmtDateTime(r.prazoEm)}</span></td>
              <td><span class="mono">${esc(r.tempoRestante)}</span></td><td>${badgeHTML(r.status)}</td>
            </tr>`).join("") || `<tr><td colspan="6"><div class="empty-state">Nenhum chamado aberto.</div></td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;
  container.querySelector("[data-go]").addEventListener("click", e => App.navigate(e.currentTarget.dataset.go));
}
