/* Tela: quadro Kanban (arrastar cards entre colunas). */

/* =========================================================
   KANBAN
   ========================================================= */
async function renderKanbanView(container, item){
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
          <p>${data.cards.length} card(s)${canEdit ? " — arraste entre as colunas" : ""}</p>
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

  if (!canEdit) return;

  container.querySelectorAll(".kanban-card").forEach(cardEl => {
    cardEl.addEventListener("dragstart", e => {
      e.dataTransfer.setData("text/plain", cardEl.dataset.card);
      setTimeout(() => cardEl.style.opacity = "0.4", 0);
    });
    cardEl.addEventListener("dragend", () => cardEl.style.opacity = "1");
  });

  container.querySelectorAll(".kanban-col").forEach(colEl => {
    colEl.addEventListener("dragover", e => { e.preventDefault(); colEl.classList.add("drag-over"); });
    colEl.addEventListener("dragleave", () => colEl.classList.remove("drag-over"));
    colEl.addEventListener("drop", async e => {
      e.preventDefault();
      colEl.classList.remove("drag-over");
      const id = e.dataTransfer.getData("text/plain");
      const colunaId = colEl.dataset.col;
      const card = data.cards.find(c => c.id === id);
      if (!card || card.colunaId === colunaId) return;
      try { await API.patch(`/kanban/cards/${id}`, { colunaId }); }
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
