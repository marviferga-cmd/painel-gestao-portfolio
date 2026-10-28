/* Tela: agenda semanal com datas reais. */

/* =========================================================
   EVENTOS DA SEMANA (datas reais)
   ========================================================= */
const WEEKDAY_NAMES = ["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"];
const MODULO_LABEL = { pessoas:"Pessoas", os:"Ordens de Serviço", sla:"SLA" };

function getMondayOfWeek(date){
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() + ((day === 0 ? -6 : 1) - day));
  d.setHours(0,0,0,0);
  return d;
}

async function renderWeekView(container, item){
  const tela = App.currentKey;
  const monday = getMondayOfWeek(App.weekAnchor);
  const nextMonday = new Date(monday); nextMonday.setDate(monday.getDate() + 7);

  container.innerHTML = loadingHTML();
  let events;
  try { events = await API.get(`/eventos?de=${encodeURIComponent(monday.toISOString())}&ate=${encodeURIComponent(nextMonday.toISOString())}`); }
  catch(err){ container.innerHTML = errorHTML(err); return; }

  const canEdit = item.nivel !== "ver";
  const today = new Date(); today.setHours(0,0,0,0);
  const fmt = d => d.toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit" });
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);

  const days = WEEKDAY_NAMES.map((name, i) => {
    const d = new Date(monday); d.setDate(monday.getDate() + i);
    const dayEvents = events.filter(ev => {
      const e = new Date(ev.inicio); e.setHours(0,0,0,0);
      return e.getTime() === d.getTime();
    });
    return `
      <div class="week-day ${d.getTime() === today.getTime() ? "is-today" : ""}">
        <div class="week-day-head"><span class="wd-name">${name}</span><span class="wd-num">${fmt(d)}</span></div>
        <div class="week-events">
          ${dayEvents.map(ev => `
            <div class="week-event mod-${esc(ev.modulo || "geral")}" title="${esc(MODULO_LABEL[ev.modulo] || "Geral")}">
              ${canEdit ? `<button class="we-del" data-del-ev="${ev.id}" aria-label="Excluir evento">×</button>` : ""}
              <span class="we-time">${new Date(ev.inicio).toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit" })}</span>${esc(ev.titulo)}
            </div>`).join("")}
        </div>
        ${canEdit ? `<button class="week-day-add" data-add-day="${i}">+ evento</button>` : ""}
      </div>`;
  }).join("");

  container.innerHTML = `
    <div class="panel week-rail">
      <div class="week-rail-head">
        <div>
          <h2>${esc(item.label)}</h2>
          <p style="font-size:12px;color:var(--muted);margin-top:3px;">Compromissos dos três módulos${canEdit ? "" : " · somente consulta"}</p>
        </div>
        <div class="week-nav">
          <button id="weekPrev" aria-label="Semana anterior">‹</button>
          <span>${fmt(monday)} – ${fmt(sunday)}</span>
          <button id="weekNext" aria-label="Próxima semana">›</button>
          <button id="weekToday" style="padding:0 12px;">Hoje</button>
        </div>
      </div>
      <div class="week-grid">${days}</div>
    </div>
  `;

  const reload = () => renderWeekView(container, item);

  App.setExport(tela, () => ({
    titulo: item.label,
    subtitulo: `Semana de ${fmt(monday)} a ${fmt(sunday)}/${sunday.getFullYear()}`,
    colunas: [
      { label: "Data", type: "date" }, { label: "Dia", type: "text" }, { label: "Horário", type: "text" },
      { label: "Descrição", type: "text" }, { label: "Módulo", type: "text" },
    ],
    linhas: events.map(ev => {
      const t = new Date(ev.inicio);
      return [
        t.toLocaleDateString("en-CA"), t.toLocaleDateString("pt-BR", { weekday: "long" }),
        t.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }), ev.titulo, MODULO_LABEL[ev.modulo] || "Geral",
      ];
    }),
  }));
  container.querySelector("#weekPrev").addEventListener("click", () => { App.weekAnchor.setDate(App.weekAnchor.getDate() - 7); reload(); });
  container.querySelector("#weekNext").addEventListener("click", () => { App.weekAnchor.setDate(App.weekAnchor.getDate() + 7); reload(); });
  container.querySelector("#weekToday").addEventListener("click", () => { App.weekAnchor = new Date(); reload(); });

  container.querySelectorAll("[data-del-ev]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!(await App.confirm({ title: "Excluir evento", message: "O evento será removido da agenda.", confirmLabel: "Excluir", danger: true }))) return;
      try { await API.del(`/eventos/${btn.dataset.delEv}`); toast("Evento excluído"); }
      catch(err){ toast(err.message, "bad"); }
      reload();
    });
  });

  container.querySelectorAll("[data-add-day]").forEach(btn => {
    btn.addEventListener("click", () => {
      const day = new Date(monday); day.setDate(monday.getDate() + Number(btn.dataset.addDay));
      App.openFormModal({
        title: `Novo evento — ${WEEKDAY_NAMES[btn.dataset.addDay]} ${fmt(day)}`,
        fields: [
          { key:"hora", label:"Horário", type:"time", required:true },
          { key:"titulo", label:"Descrição", type:"text", required:true },
          { key:"modulo", label:"Módulo", type:"select", options:[
            { value:"", label:"Geral" }, { value:"pessoas", label:"Pessoas" },
            { value:"os", label:"Ordens de Serviço" }, { value:"sla", label:"SLA" }] },
        ],
        initialValues: { hora: "09:00" },
        onSubmit: async (values) => {
          const [h, m] = String(values.hora || "09:00").split(":").map(Number);
          const inicio = new Date(day); inicio.setHours(h, m, 0, 0);
          await API.post("/eventos", { titulo: values.titulo, modulo: values.modulo || null, inicio: inicio.toISOString() });
          toast("Evento criado");
          reload();
        },
      });
    });
  });
}
