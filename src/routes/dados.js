/* Tabelas genéricas (CRUD dirigido por src/modules.js) e listas dos <select>. */
import { Router } from "express";
import { prisma } from "../db.js";
import { findModule } from "../modules.js";
import { createRow, deleteRow, listRows, LOOKUPS, updateRow } from "../crud.js";
import { exigirTela } from "../auth.js";
import { registrar } from "../config.js";
import { httpError, idParam } from "../lib/http.js";

export const dadosApi = Router();

const editar = { editar: true };
const telaDoParam = (req) => req.params.key;

function tableModule(req, { write = false } = {}) {
  const mod = findModule(req.params.key);
  if (!mod || mod.type !== "table") throw httpError(404, `Módulo desconhecido: ${req.params.key}`);
  if (write && mod.readOnly) throw httpError(405, "Este painel é calculado automaticamente e não aceita edição");
  return mod;
}

/* texto curto do registro para o histórico: valor da primeira coluna */
function rotulo(mod, row) {
  const col = mod.columns[0];
  return row._labels?.[col.key] ?? row[col.key] ?? row.id;
}

// a lista de faturas mostra valores: só para quem vê as telas financeiras
dadosApi.get("/lookups/:name", exigirTela((req) => (req.params.name === "faturas" ? ["faturamento", "notas-fiscais"] : null)), async (req, res) => {
  const fn = LOOKUPS[req.params.name];
  if (!fn) throw httpError(404, "Lista desconhecida");
  res.json(await fn(prisma));
});

dadosApi.get("/modules/:key", exigirTela(telaDoParam), async (req, res) => {
  res.json(await listRows(prisma, tableModule(req)));
});

dadosApi.post("/modules/:key", exigirTela(telaDoParam, editar), async (req, res) => {
  const mod = tableModule(req, { write: true });
  const row = await createRow(prisma, mod, req.body);
  registrar(req, "criou", mod.key, `${mod.label}: ${rotulo(mod, row)}`);
  res.status(201).json(row);
});

dadosApi.put("/modules/:key/:id", exigirTela(telaDoParam, editar), async (req, res) => {
  const mod = tableModule(req, { write: true });
  const row = await updateRow(prisma, mod, idParam(req), req.body);
  registrar(req, "alterou", mod.key, `${mod.label}: ${rotulo(mod, row)}`);
  res.json(row);
});

dadosApi.delete("/modules/:key/:id", exigirTela(telaDoParam, editar), async (req, res) => {
  const mod = tableModule(req, { write: true });
  const row = await deleteRow(prisma, mod, idParam(req));
  registrar(req, "excluiu", mod.key, `${mod.label}: ${rotulo(mod, row)}`);
  res.status(204).end();
});
