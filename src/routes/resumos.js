/* Indicadores calculados (nada aqui é gravado: tudo vem dos cadastros). */
import { Router } from "express";
import { prisma } from "../db.js";
import { exigirTela, podeVer } from "../auth.js";
import { slaStatus, tempoRestante, todayDate } from "../lib/format.js";

export const resumosApi = Router();

const OS_FINALIZADAS = ["Concluída", "Cancelada"];
const soma = (arr) => arr.reduce((s, f) => s + Number(f.valor), 0);
const nomeSel = { select: { nome: true } };

/* ---------------- visão geral (tela inicial) ----------------
   Cada bloco só é calculado se o usuário puder ver a tela de origem. */
resumosApi.get("/geral", async (req, res) => {
  const u = req.user;
  const ve = (...telas) => telas.some((t) => podeVer(u, t));
  const hoje = todayDate();
  const em7 = new Date(hoje.getTime() + 7 * 86400e3);
  const agora = new Date();
  const out = { blocos: {}, pendencias: [] };
  const pend = (tom, texto, tela) => out.pendencias.push({ tom, texto, tela });
  const tarefas = [];

  if (ve("colaboradores")) tarefas.push((async () => {
    const [ativos, setores] = await Promise.all([
      prisma.colaborador.count({ where: { ativo: true } }),
      prisma.colaborador.groupBy({ by: ["setor"], where: { ativo: true, setor: { not: null } } }),
    ]);
    out.blocos.pessoas = { ativos, setores: setores.length };
  })());

  if (ve("ferias")) tarefas.push((async () => {
    const [emFerias, proximas] = await Promise.all([
      prisma.ferias.count({ where: { inicio: { lte: hoje }, fim: { gte: hoje }, status: { not: "Cancelada" } } }),
      prisma.ferias.findMany({
        where: { inicio: { gt: hoje, lte: em7 }, status: { not: "Cancelada" } },
        include: { colaborador: nomeSel }, orderBy: { inicio: "asc" }, take: 5,
      }),
    ]);
    out.blocos.ferias = { emFerias, proximas: proximas.length };
    for (const f of proximas) pend("info", `${f.colaborador.nome} sai de férias em ${f.inicio.toISOString().slice(8, 10)}/${f.inicio.toISOString().slice(5, 7)}`, "ferias");
  })());

  if (ve("afastamentos")) tarefas.push((async () => {
    out.blocos.afastamentos = { ativos: await prisma.afastamento.count({ where: { status: "Em andamento" } }) };
  })());

  if (ve("cargos-salarios")) tarefas.push((async () => {
    const cargos = await prisma.cargo.findMany({
      where: { ativo: true, equipeMinima: { gt: 0 } },
      include: { _count: { select: { colaboradores: { where: { ativo: true } } } } },
    });
    const minima = cargos.reduce((s, c) => s + c.equipeMinima, 0);
    const ocupados = cargos.reduce((s, c) => s + Math.min(c._count.colaboradores, c.equipeMinima), 0);
    const abaixo = cargos.filter((c) => c._count.colaboradores < c.equipeMinima);
    out.blocos.contrato = { equipeMinima: minima, ocupados, cargosAbaixo: abaixo.length, cargos: cargos.length };
    if (abaixo.length) pend("warn", `${abaixo.length} cargo(s) do contrato abaixo da equipe mínima`, "cargos-salarios");
  })());

  if (ve("controle-os", "indicadores")) tarefas.push((async () => {
    const [abertas, atrasadas] = await Promise.all([
      prisma.ordemServico.count({ where: { status: { notIn: OS_FINALIZADAS } } }),
      prisma.ordemServico.count({ where: { status: { notIn: OS_FINALIZADAS }, prazo: { lt: hoje } } }),
    ]);
    out.blocos.os = { abertas, atrasadas };
    if (atrasadas) pend("bad", `${atrasadas} ordem(ns) de serviço fora do prazo`, ve("controle-os") ? "controle-os" : "indicadores");
  })());

  if (ve("chamados-risco", "dashboards-sla")) tarefas.push((async () => {
    const abertos = await prisma.chamado.findMany({ where: { concluidoEm: null }, select: { prazoEm: true, concluidoEm: true } });
    const st = abertos.map((c) => slaStatus(c, agora));
    const atrasados = st.filter((s) => s === "Atrasado").length;
    const risco = st.filter((s) => s === "Crítico" || s === "Atenção").length;
    out.blocos.sla = { abertos: abertos.length, noPrazo: st.filter((s) => s === "No prazo").length, risco, atrasados };
    const tela = ve("chamados-risco") ? "chamados-risco" : "dashboards-sla";
    if (atrasados) pend("bad", `${atrasados} chamado(s) com SLA estourado`, tela);
    if (risco) pend("warn", `${risco} chamado(s) vencem em menos de 24 h`, tela);
  })());

  if (ve("faturamento")) tarefas.push((async () => {
    const abertas = await prisma.fatura.findMany({ where: { status: "Em aberto" }, select: { valor: true, vencimento: true } });
    const vencidas = abertas.filter((f) => f.vencimento < hoje);
    out.blocos.financeiro = { aReceber: soma(abertas), vencido: soma(vencidas), faturasVencidas: vencidas.length };
    if (vencidas.length) pend("bad", `${vencidas.length} fatura(s) vencida(s) sem pagamento`, "faturamento");
  })());

  if (ve("eventos-semana")) tarefas.push((async () => {
    const eventos = await prisma.evento.findMany({ where: { inicio: { gte: agora } }, orderBy: { inicio: "asc" }, take: 5 });
    out.proximosEventos = eventos.map((e) => ({ id: e.id, titulo: e.titulo, inicio: e.inicio, modulo: e.modulo }));
  })());

  if (u.papel === "admin") tarefas.push((async () => {
    const pendentes = await prisma.usuario.count({ where: { status: "pendente" } });
    if (pendentes) pend("warn", `${pendentes} cadastro(s) aguardando sua aprovação`, "usuarios");
  })());

  await Promise.all(tarefas);
  const ordem = { bad: 0, warn: 1, info: 2 };
  out.pendencias.sort((a, b) => ordem[a.tom] - ordem[b.tom]);
  res.json(out);
});

/* ---------------- ordens de serviço e financeiro ---------------- */
resumosApi.get("/os", exigirTela("indicadores"), async (req, res) => {
  const [ordens, faturas, ativos] = await Promise.all([
    prisma.ordemServico.findMany({ include: { cliente: nomeSel, servico: nomeSel, responsavel: nomeSel }, orderBy: { prazo: "asc" } }),
    prisma.fatura.findMany({ select: { valor: true, status: true, vencimento: true } }),
    prisma.colaborador.count({ where: { ativo: true } }),
  ]);
  const hoje = todayDate();
  const abertas = ordens.filter((o) => !OS_FINALIZADAS.includes(o.status));
  const validas = faturas.filter((f) => f.status !== "Cancelado");
  res.json({
    kpis: {
      osAbertas: abertas.length,
      osConcluidas: ordens.filter((o) => o.status === "Concluída").length,
      osAtrasadas: abertas.filter((o) => o.prazo < hoje).length,
      faturado: soma(validas),
      recebido: soma(validas.filter((f) => f.status === "Pago")),
      emAberto: soma(validas.filter((f) => f.status === "Em aberto")),
      vencido: soma(validas.filter((f) => f.status === "Em aberto" && f.vencimento < hoje)),
      osPorColaborador: ativos ? abertas.length / ativos : 0,
    },
    ordens: ordens.map((o) => ({
      numero: o.numero, cliente: o.cliente.nome, servico: o.servico?.nome ?? "—",
      responsavel: o.responsavel?.nome ?? "—", prazo: o.prazo.toISOString().slice(0, 10),
      status: o.status, atrasada: !OS_FINALIZADAS.includes(o.status) && o.prazo < hoje,
    })),
  });
});

resumosApi.get("/clientes", exigirTela("relatorios"), async (req, res) => {
  const clientes = await prisma.cliente.findMany({
    orderBy: { nome: "asc" },
    include: {
      ordens: { select: { status: true } },
      faturas: { select: { valor: true, status: true } },
      chamados: { select: { prazoEm: true, concluidoEm: true } },
    },
  });
  res.json(clientes.map((c) => {
    const validas = c.faturas.filter((f) => f.status !== "Cancelado");
    const abertos = c.chamados.filter((x) => !x.concluidoEm);
    return {
      cliente: c.nome,
      osTotal: c.ordens.length,
      osAbertas: c.ordens.filter((o) => !OS_FINALIZADAS.includes(o.status)).length,
      faturado: soma(validas),
      emAberto: soma(validas.filter((f) => f.status === "Em aberto")),
      chamadosAbertos: abertos.length,
      chamadosAtrasados: abertos.filter((x) => slaStatus(x) === "Atrasado").length,
    };
  }));
});

/* ---------------- SLA ---------------- */
resumosApi.get("/sla", exigirTela("dashboards-sla"), async (req, res) => {
  const desde = new Date(Date.now() - 30 * 86400e3);
  const [abertos, concluidos] = await Promise.all([
    prisma.chamado.findMany({ where: { concluidoEm: null }, include: { cliente: nomeSel, responsavel: nomeSel }, orderBy: { prazoEm: "asc" } }),
    prisma.chamado.findMany({ where: { concluidoEm: { gte: desde } }, select: { prazoEm: true, concluidoEm: true } }),
  ]);
  const rows = abertos.map((c) => ({
    id: c.id, chamado: c.codigo, cliente: c.cliente.nome, responsavel: c.responsavel?.nome ?? "—",
    prazoEm: c.prazoEm.toISOString(), tempoRestante: tempoRestante(c), status: slaStatus(c),
  }));
  const count = (s) => rows.filter((r) => r.status === s).length;
  res.json({
    abertos: rows.length,
    noPrazo: count("No prazo"),
    atencao: count("Atenção"),
    critico: count("Crítico"),
    atrasado: count("Atrasado"),
    concluidos30d: concluidos.length,
    concluidosNoPrazo30d: concluidos.filter((c) => c.concluidoEm <= c.prazoEm).length,
    rows,
  });
});

resumosApi.get("/alertas", exigirTela(["chamados-risco", "dashboards-sla"]), async (req, res) => {
  const limite = new Date(Date.now() + 24 * 3600e3);
  res.json({ chamadosEmRisco: await prisma.chamado.count({ where: { concluidoEm: null, prazoEm: { lt: limite } } }) });
});
