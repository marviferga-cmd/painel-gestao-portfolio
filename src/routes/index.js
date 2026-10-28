/* =========================================================
   API /api — monta as rotas por assunto
     /auth        login, cadastro, convite (público)
     /admin       usuários, perfis, configurações, histórico (admin)
     /meta        telas e permissões do usuário logado
     /modules     tabelas genéricas · /lookups listas dos selects
     /kanban      quadro de tarefas
     /eventos     agenda
     /resumo      indicadores calculados
   ========================================================= */
import { Router } from "express";
import { prisma } from "../db.js";
import { publicMeta } from "../modules.js";
import { seed } from "../../prisma/seed.js";
import { authApi, carregarUsuario, exigirAdmin, exigirLogin, nivelAcesso, podeVer, usuarioPublico } from "../auth.js";
import { configPublica, registrar } from "../config.js";
import { errorHandler, httpError } from "../lib/http.js";
import { adminApi } from "./admin.js";
import { dadosApi } from "./dados.js";
import { kanbanApi } from "./kanban.js";
import { eventosApi } from "./eventos.js";
import { resumosApi } from "./resumos.js";

export const api = Router();

/* login/cadastro ficam abertos; todo o resto exige sessão */
api.use("/auth", authApi);
api.use(carregarUsuario, exigirLogin);

const allowReset = () => process.env.ALLOW_DEMO_RESET === "true";

const ITENS_ADMIN = [
  { key: "usuarios", label: "Usuários e convites", icon: "usercheck", accent: "indigo", type: "users",
    desc: "Convidar colaboradores, aprovar cadastros e definir o que cada pessoa pode ver ou editar." },
  { key: "perfis", label: "Perfis de acesso", icon: "shield", accent: "violet", type: "profiles",
    desc: "Modelos de permissão reutilizáveis (RH, Financeiro, Consulta…)." },
  { key: "atividade", label: "Histórico", icon: "history", accent: "teal", type: "activity",
    desc: "Quem criou, alterou ou excluiu cada registro, e quando." },
  { key: "configuracoes", label: "Configurações", icon: "gear", accent: "slate", type: "settings",
    desc: "Nome e cor do painel, cadastro público e validade dos convites." },
];

api.get("/meta", async (req, res) => {
  const meta = publicMeta();
  meta.groups = meta.groups
    .map((g) => ({ ...g, items: g.items.filter((i) => podeVer(req.user, i.key)).map((i) => ({ ...i, nivel: nivelAcesso(req.user, i.key) })) }))
    .filter((g) => g.items.length);
  if (req.user.papel === "admin") {
    meta.groups.push({ key: "admin", label: "Administração", items: ITENS_ADMIN.map((i) => ({ ...i, nivel: "editar" })) });
    meta.pendentes = await prisma.usuario.count({ where: { status: "pendente" } });
  }
  res.json({
    ...meta,
    versao: process.env.npm_package_version ?? null,
    config: await configPublica(),
    user: { ...usuarioPublico(req.user), perfil: req.user.perfil?.nome ?? null },
    allowReset: allowReset() && req.user.papel === "admin",
  });
});

api.post("/admin/reset", exigirAdmin, async (req, res) => {
  if (!allowReset()) throw httpError(403, "Restauração desativada neste ambiente (ALLOW_DEMO_RESET)");
  await seed(prisma);
  registrar(req, "admin", null, "Restaurou os dados de exemplo");
  res.json({ ok: true });
});

api.use("/admin", adminApi);
api.use("/kanban", kanbanApi);
api.use("/eventos", eventosApi);
api.use("/resumo", resumosApi);
api.use(dadosApi);

api.use((req, res) => res.status(404).json({ error: "Rota não encontrada" }));
api.use(errorHandler);
