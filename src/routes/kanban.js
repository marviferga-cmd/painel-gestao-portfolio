/* Quadro Kanban: colunas fixas por quadro, cards livres. */
import { Router } from "express";
import { prisma } from "../db.js";
import { MODULES } from "../modules.js";
import { exigirTela } from "../auth.js";
import { registrar } from "../config.js";
import { ValidationError } from "../lib/format.js";
import { httpError, idParam, uuidOuNull } from "../lib/http.js";

export const kanbanApi = Router();

const editar = { editar: true };
const telaDoQuadro = (board) => MODULES.find((m) => m.type === "kanban" && m.board === board)?.key ?? null;
async function telaDoCard(req) {
  const card = await prisma.kanbanCard.findUnique({ where: { id: idParam(req) }, include: { coluna: { select: { quadro: true } } } });
  return card ? telaDoQuadro(card.coluna.quadro) : null;
}

async function nextOrder(colunaId) {
  const agg = await prisma.kanbanCard.aggregate({ where: { colunaId }, _max: { ordem: true } });
  return (agg._max.ordem ?? -1) + 1;
}

kanbanApi.get("/:board", exigirTela((req) => telaDoQuadro(req.params.board)), async (req, res) => {
  const colunas = await prisma.kanbanColuna.findMany({
    where: { quadro: req.params.board },
    orderBy: { ordem: "asc" },
    include: { cards: { orderBy: [{ ordem: "asc" }, { createdAt: "asc" }] } },
  });
  res.json({
    columns: colunas.map((c) => ({ id: c.id, titulo: c.titulo })),
    cards: colunas.flatMap((c) => c.cards.map((k) => ({ id: k.id, colunaId: k.colunaId, titulo: k.titulo, etiqueta: k.etiqueta, ordem: k.ordem }))),
  });
});

kanbanApi.post("/:board/cards", exigirTela((req) => telaDoQuadro(req.params.board), editar), async (req, res) => {
  const titulo = String(req.body?.titulo ?? "").trim();
  const colunaId = uuidOuNull(req.body?.colunaId, "Coluna");
  if (!titulo) throw new ValidationError("Título é obrigatório");
  const coluna = colunaId && await prisma.kanbanColuna.findFirst({ where: { id: colunaId, quadro: req.params.board } });
  if (!coluna) throw new ValidationError("Coluna inválida");
  const card = await prisma.kanbanCard.create({
    data: { titulo: titulo.slice(0, 300), etiqueta: String(req.body?.etiqueta ?? "").trim() || null, colunaId, ordem: await nextOrder(colunaId) },
  });
  registrar(req, "criou", telaDoQuadro(req.params.board), `Card "${card.titulo}"`);
  res.status(201).json(card);
});

/* Mover: { colunaId, posicao? } — posicao é o índice na coluna de destino (sem ele, vai para o fim).
   Os outros cards da coluna são renumerados na mesma transação. */
kanbanApi.patch("/cards/:id", exigirTela(telaDoCard, editar), async (req, res) => {
  const id = idParam(req);
  const data = {};
  const reordenar = [];
  let destino = null;
  if (req.body?.colunaId !== undefined) {
    // só move dentro do mesmo quadro: a permissão foi checada para o quadro de origem
    data.colunaId = uuidOuNull(req.body.colunaId, "Coluna");
    const atual = await prisma.kanbanCard.findUnique({ where: { id }, include: { coluna: { select: { quadro: true } } } });
    if (!atual) throw httpError(404, "Registro não encontrado");
    destino = data.colunaId && await prisma.kanbanColuna.findFirst({ where: { id: data.colunaId, quadro: atual.coluna.quadro } });
    if (!destino) throw new ValidationError("Coluna inválida");
    if (destino.id === atual.colunaId && req.body.posicao === undefined) destino = null; // nada a mover

    const outros = await prisma.kanbanCard.findMany({
      where: { colunaId: data.colunaId, id: { not: id } },
      orderBy: [{ ordem: "asc" }, { createdAt: "asc" }],
      select: { id: true },
    });
    const pos = req.body.posicao === undefined || req.body.posicao === null ? NaN : Number(req.body.posicao);
    data.ordem = Number.isInteger(pos) ? Math.max(0, Math.min(pos, outros.length)) : outros.length;
    outros.forEach((c, i) => {
      const ordem = i < data.ordem ? i : i + 1;
      reordenar.push(prisma.kanbanCard.update({ where: { id: c.id }, data: { ordem } }));
    });
  }
  if (req.body?.titulo !== undefined) data.titulo = String(req.body.titulo).trim().slice(0, 300);
  if (req.body?.etiqueta !== undefined) data.etiqueta = String(req.body.etiqueta).trim() || null;
  const card = (await prisma.$transaction([...reordenar, prisma.kanbanCard.update({ where: { id }, data })])).at(-1);
  registrar(req, destino ? "moveu" : "alterou", await telaDoCard(req), destino ? `Card "${card.titulo}" → ${destino.titulo}` : `Card "${card.titulo}"`);
  res.json(card);
});

kanbanApi.delete("/cards/:id", exigirTela(telaDoCard, editar), async (req, res) => {
  const tela = await telaDoCard(req);
  const card = await prisma.kanbanCard.delete({ where: { id: idParam(req) } });
  registrar(req, "excluiu", tela, `Card "${card.titulo}"`);
  res.status(204).end();
});
