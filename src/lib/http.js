/* Utilitários HTTP compartilhados pelas rotas: IDs (UUID), erros e respostas. */
import { ValidationError } from "./format.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (v) => typeof v === "string" && UUID.test(v);

/* id da URL (/:id) */
export function idParam(req) {
  const id = req.params.id;
  if (!isUuid(id)) throw new ValidationError("id inválido");
  return id.toLowerCase();
}

/* id opcional vindo do corpo: "" e null viram null */
export function uuidOuNull(value, label) {
  if (value === null || value === undefined || value === "") return null;
  if (!isUuid(String(value))) throw new ValidationError(`${label}: identificador inválido`);
  return String(value).toLowerCase();
}

export function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

/* Tradução de erros do Prisma/Express para respostas JSON legíveis. */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const prismaMsg = {
    P2002: [409, () => {
      const campos = [].concat(err.meta?.target ?? err.meta?.driverAdapterError?.cause?.constraint?.fields ?? []);
      return `Já existe um registro com esse valor${campos.length ? ` (${campos.join(", ")})` : ""}`;
    }],
    P2003: [409, () => "Não é possível excluir/alterar: há registros vinculados a este item"],
    P2025: [404, () => "Registro não encontrado"],
  }[err.code];
  if (prismaMsg) return res.status(prismaMsg[0]).json({ error: prismaMsg[1]() });
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "JSON inválido" });
  if (err.type === "entity.too.large") return res.status(413).json({ error: "Conteúdo grande demais" });
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? "Erro interno no servidor" : err.message });
}
