/* Tela: quadro Kanban (arrastar cards entre colunas). */

/* =========================================================
   KANBAN
   ========================================================= */
async function renderKanbanView(container, item){
  const tela = App.currentKey;
  const board = "pessoas";
  container.innerHTML = loadingHTML();
  let data;
  try { data = await API.get(`/kanban/${board}`); }
  catch(err){ container.innerHTML = errorHTML(err); return; }

  const reload = () => renderKanbanView(container, item);
  const canEdit = item.nivel !== "ver";

  container.innerHTML = `
    <div class="panel" style="padding:18px;">
      <div class="panel-head" style="border:none; padding:0 0 16px;">
        <div>
          <h2>${esc(item.label)}</h2>
          <p>${data.cards.length} card(s)${canEdit ? " — arraste para mover ou reordenar" : ""}</p>
        </div>
        ${canEdit ? `<button class="btn btn-primary" id="addCardBtn">+ Novo card</button>` : `<span class="readonly-note">Somente consulta</span>`}
      </div>
      <div class="kanban">
        ${data.columns.map(col => {
          const cards = data.cards.filter(c => c.colunaId === col.id);
          return `
          <div class="kanban-col" data-col="${col.id}">
            <div class="kanban-col-head"><h3>${esc(col.titulo)}</h3><span>${cards.length}</span></div>
            ${cards.map(c => `
              <div class="kanban-card${canEdit ? "" : " is-static"}" draggable="${canEdit}" data-card="${c.id}">
                <div class="kc-title">${esc(c.titulo)}</div>
                <div class="kc-meta"><span class="kc-tag">${esc(c.etiqueta || "")}</span>
                  ${canEdit ? `<button class="icon-btn kc-del" data-del-card="${c.id}" title="Excluir card" aria-label="Excluir card">✕</button>` : ""}
                </div>
              </div>`).join("")}
          </div>`;
        }).join("")}
      </div>
    </div>
  `;

  App.setExport(tela, () => ({
    titulo: item.label,
    subtitulo: `${data.cards.length} card(s)`,
    resumo: data.columns.map(col => [col.titulo, data.cards.filter(c => c.colunaId === col.id).length, "number"]),
    colunas: [{ label: "Coluna", type: "text" }, { label: "Card", type: "text" }, { label: "Etiqueta", type: "text" }],
    linhas: data.columns.flatMap(col => data.cards.filter(c => c.colunaId === col.id).map(c => [col.titulo, c.titulo, c.etiqueta || null])),
  }));

  if (!canEdit) return;

  container.querySelectorAll(".kanban-card").forEach(cardEl => {
    cardEl.addEventListener("dragstart", e => {
      e.dataTransfer.setData("text/plain", cardEl.dataset.card);
      setTimeout(() => cardEl.classList.add("dragging"), 0);
    });
    cardEl.addEventListener("dragend", () => cardEl.classList.remove("dragging"));
  });

  // card da coluna antes do qual o arrastado vai entrar (null = fim da coluna)
  const cardBefore = (colEl, y) => [...colEl.querySelectorAll(".kanban-card:not(.dragging)")]
    .find(el => { const r = el.getBoundingClientRect(); return y < r.top + r.height / 2; }) ?? null;
  const clearMarks = (colEl) => colEl.querySelectorAll(".drop-before").forEach(el => el.classList.remove("drop-before"));

  container.querySelectorAll(".kanban-col").forEach(colEl => {
    colEl.addEventListener("dragover", e => {
      e.preventDefault();
      colEl.classList.add("drag-over");
      clearMarks(colEl);
      cardBefore(colEl, e.clientY)?.classList.add("drop-before");
    });
    colEl.addEventListener("dragleave", e => {
      if (colEl.contains(e.relatedTarget)) return;
      colEl.classList.remove("drag-over");
      clearMarks(colEl);
    });
    colEl.addEventListener("drop", async e => {
      e.preventDefault();
      const before = cardBefore(colEl, e.clientY);
      colEl.classList.remove("drag-over");
      clearMarks(colEl);
      const id = e.dataTransfer.getData("text/plain");
      const colunaId = colEl.dataset.col;
      const card = data.cards.find(c => c.id === id);
      if (!card) return;
      const others = [...colEl.querySelectorAll(".kanban-card")].filter(el => el.dataset.card !== id);
      const posicao = before ? others.indexOf(before) : others.length;
      const atual = data.cards.filter(c => c.colunaId === colunaId).map(c => c.id);
      if (card.colunaId === colunaId && atual.indexOf(id) === posicao) return; // soltou no mesmo lugar
      try { await API.patch(`/kanban/cards/${id}`, { colunaId, posicao }); }
      catch(err){ toast(err.message, "bad"); }
      reload();
    });
  });

  container.querySelectorAll("[data-del-card]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!(await App.confirm({ title: "Excluir card", message: "O card será removido do quadro.", confirmLabel: "Excluir", danger: true }))) return;
      try { await API.del(`/kanban/cards/${btn.dataset.delCard}`); toast("Card excluído"); }
      catch(err){ toast(err.message, "bad"); }
      reload();
    });
  });

  container.querySelector("#addCardBtn").addEventListener("click", () => {
    App.openFormModal({
      title: "Novo card",
      fields: [
        { key:"titulo", label:"Título", type:"text", required:true },
        { key:"etiqueta", label:"Etiqueta", type:"text" },
        { key:"colunaId", label:"Coluna", type:"select", required:true, options: data.columns.map(c => ({ value:c.id, label:c.titulo })) },
      ],
      onSubmit: async (values) => {
        await API.post(`/kanban/${board}/cards`, values);
        toast("Card criado");
        reload();
      },
    });
  });
}
