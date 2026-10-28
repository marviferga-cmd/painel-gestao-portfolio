/* Agenda de eventos com data e hora reais. */
import { Router } from "express";
import { prisma } from "../db.js";
import { exigirTela } from "../auth.js";
import { registrar } from "../config.js";
import { ValidationError } from "../lib/format.js";
import { idParam } from "../lib/http.js";

export const eventosApi = Router();
const TELA = "eventos-semana";

eventosApi.get("/", exigirTela(TELA), async (req, res) => {
  const de = new Date(req.query.de);
  const ate = new Date(req.query.ate);
  if (Number.isNaN(de.getTime()) || Number.isNaN(ate.getTime())) throw new ValidationError("Parâmetros de/ate inválidos");
  res.json(await prisma.evento.findMany({ where: { inicio: { gte: de, lt: ate } }, orderBy: { inicio: "asc" } }));
});

eventosApi.post("/", exigirTela(TELA, { editar: true }), async (req, res) => {
  const titulo = String(req.body?.titulo ?? "").trim();
  const inicio = new Date(req.body?.inicio);
  if (!titulo) throw new ValidationError("Descrição é obrigatória");
  if (Number.isNaN(inicio.getTime())) throw new ValidationError("Data/hora inválida");
  const modulo = ["pessoas", "os", "sla"].includes(req.body?.modulo) ? req.body.modulo : null;
  const evento = await prisma.evento.create({ data: { titulo: titulo.slice(0, 300), inicio, modulo } });
  registrar(req, "criou", TELA, `Evento "${evento.titulo}"`);
  res.status(201).json(evento);
});

eventosApi.delete("/:id", exigirTela(TELA, { editar: true }), async (req, res) => {
  const evento = await prisma.evento.delete({ where: { id: idParam(req) } });
  registrar(req, "excluiu", TELA, `Evento "${evento.titulo}"`);
  res.status(204).end();
});
