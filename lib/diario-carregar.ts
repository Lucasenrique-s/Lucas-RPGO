// Carrega o diário de uma mesa pro que a pessoa pode ler. Só servidor.
// Usado pela página /diario/[mesaId] e pela aba Diário da ficha.

import { prisma } from "@/lib/prisma";
import { acessoAoDiario, filtroLeituraDiario } from "@/lib/diario";
import { carregarCalendario } from "@/lib/calendario/carregar";
import type {
  CalendarioDiarioDTO,
  CamposFicha,
  FichaDiarioDTO,
  MarcoDiarioDTO,
  MencaoDiarioDTO,
  NotaDiarioDTO,
  RelacaoDTO,
  SessaoDiarioDTO,
  TipoFichaDiario,
} from "@/lib/diario-tipos";
import { normalizarTipoFicha } from "@/lib/diario-tipos";

export type DadosDiario = {
  mesaNome: string;
  meuId: string;
  ehNarrador: boolean;
  fichas: FichaDiarioDTO[];
  notas: NotaDiarioDTO[];
  sessoes: SessaoDiarioDTO[];
  mencoes: MencaoDiarioDTO[];
  relacoes: RelacaoDTO[];
  marcos: MarcoDiarioDTO[];
  autores: Record<string, string>;
  calendario: CalendarioDiarioDTO | null;
  // Narrador vendo o diário de um jogador: só leitura.
  somenteLeitura: boolean;
};

// null = a pessoa não participa da mesa.
// `comoUserId`: o narrador abriu a ficha de um jogador e vê o diário COMO esse jogador
// (o que ele veria: as notas dele e o público, nada dos outros), só leitura.
// Quem não é o narrador da mesa recebe null nesse modo.
export async function carregarDiario(
  mesaId: string,
  userId: string,
  opts?: { comoUserId?: string },
): Promise<DadosDiario | null> {
  const real = await acessoAoDiario(mesaId, userId);
  if (!real) return null;
  let acesso = real;
  let somenteLeitura = false;
  if (opts?.comoUserId && opts.comoUserId !== userId) {
    if (!real.narrador) return null;
    const como = await acessoAoDiario(mesaId, opts.comoUserId);
    if (!como) return null;
    acesso = como;
    somenteLeitura = true;
  }

  // O filtro de leitura vai na própria consulta: nota alheia nem sai do banco.
  const filtro = filtroLeituraDiario(acesso);
  const [mesa, fichas, notas, sessoes, membros, cal] = await Promise.all([
    prisma.mesa.findUniqueOrThrow({ where: { id: mesaId }, select: { nome: true, userId: true } }),
    prisma.diarioFicha.findMany({ where: { mesaId, ...filtro }, orderBy: { criadaEm: "asc" }, include: { retratos: { orderBy: { ordem: "asc" } } } }),
    prisma.diarioNota.findMany({ where: { mesaId, ...filtro }, orderBy: { criadaEm: "desc" } }),
    prisma.sessao.findMany({ where: { mesaId }, orderBy: { iniciadaEm: "desc" } }),
    prisma.personagem.findMany({
      where: { OR: [{ mesaId }, { dono: { mesaId } }], donoPersonagemId: null },
      select: { userId: true, nome: true },
    }),
    // Jogador não recebe evento oculto (o carregador já filtra).
    carregarCalendario(mesaId, { isNarrador: acesso.narrador }),
  ]);

  // Backlinks: só de origens que esta pessoa já pode ler (fichas e notas acima).
  const origens = [...fichas.map((f) => f.id), ...notas.map((n) => n.id)];
  const mencoes = await prisma.diarioMencao.findMany({ where: { origemId: { in: origens } } });
  // Relações só entre páginas que esta pessoa lê; marcos são do próprio jogador (o narrador lê todos).
  const idsFichas = fichas.map((f) => f.id);
  const [relacoes, marcos] = await Promise.all([
    prisma.diarioRelacao.findMany({ where: { mesaId, deId: { in: idsFichas }, paraId: { in: idsFichas } }, orderBy: { criadaEm: "asc" } }),
    prisma.diarioMarco.findMany({ where: { mesaId, ...(acesso.narrador ? {} : { autorId: acesso.userId }) }, orderBy: { nome: "asc" } }),
  ]);

  // Quem escreveu: nome do personagem do jogador; o narrador aparece como tal.
  const autores: Record<string, string> = {};
  for (const m of membros) autores[m.userId] = autores[m.userId] ? `${autores[m.userId]}, ${m.nome}` : m.nome;
  autores[mesa.userId] = "Narrador";

  return {
    mesaNome: mesa.nome,
    meuId: acesso.userId,
    ehNarrador: acesso.narrador,
    fichas: fichas.map((f) => ({
      id: f.id,
      autorId: f.autorId,
      tipo: normalizarTipoFicha(f.tipo),
      nome: f.nome,
      apelidos: f.apelidos,
      retratoUrl: f.retratoUrl,
      retratos: f.retratos.map((r) => ({ id: r.id, url: r.url, legenda: r.legenda })),
      campos: (f.campos ?? {}) as CamposFicha,
      resumo: f.resumo,
      visibilidade: f.visibilidade,
      editores: f.editores,
      criadaEm: f.criadaEm.toISOString(),
      atualizadaEm: f.atualizadaEm.toISOString(),
    })),
    notas: notas.map((n) => ({
      id: n.id,
      autorId: n.autorId,
      sessaoId: n.sessaoId,
      diaJogo: n.diaJogo,
      titulo: n.titulo,
      corpo: n.corpo,
      tags: n.tags,
      importante: n.importante,
      visibilidade: n.visibilidade,
      criadaEm: n.criadaEm.toISOString(),
    })),
    sessoes: sessoes.map((s) => ({
      id: s.id,
      numero: s.numero,
      titulo: s.titulo,
      iniciadaEm: s.iniciadaEm.toISOString(),
      encerradaEm: s.encerradaEm?.toISOString() ?? null,
      ativa: s.encerradaEm === null,
    })),
    mencoes: mencoes.map((m) => ({
      origemTipo: m.origemTipo as MencaoDiarioDTO["origemTipo"],
      origemId: m.origemId,
      alvoTipo: m.alvoTipo as MencaoDiarioDTO["alvoTipo"],
      alvoId: m.alvoId,
    })),
    relacoes: relacoes.map((r) => ({ id: r.id, deId: r.deId, verbo: r.verbo, paraId: r.paraId })),
    marcos: marcos.map((m) => ({ id: m.id, nome: m.nome })),
    autores,
    somenteLeitura,
    calendario: cal
      ? {
          config: cal.config,
          hoje: cal.dataAtualDias,
          eventos: cal.eventos.map((e) => ({ id: e.id, titulo: e.titulo, dataDias: e.dataDias })),
        }
      : null,
  };
}

export type RefsDiario = {
  meuId: string;
  fichas: { id: string; nome: string; tipo: TipoFichaDiario; apelidos: string[] }[];
  marcos: MarcoDiarioDTO[];
  sessoes: SessaoDiarioDTO[];
  calendario: CalendarioDiarioDTO | null;
};

// O mínimo que a anotação rápida precisa pra oferecer o `@`: nomes de fichas,
// sessões e o calendário. Sem texto de nota nem de ficha. null = fora da mesa.
export async function carregarRefsDiario(mesaId: string, userId: string): Promise<RefsDiario | null> {
  const acesso = await acessoAoDiario(mesaId, userId);
  if (!acesso) return null;
  const filtro = filtroLeituraDiario(acesso);
  const [fichas, sessoes, cal, marcos] = await Promise.all([
    prisma.diarioFicha.findMany({
      where: { mesaId, ...filtro },
      select: { id: true, nome: true, tipo: true, apelidos: true },
      orderBy: { criadaEm: "asc" },
    }),
    prisma.sessao.findMany({ where: { mesaId }, orderBy: { iniciadaEm: "desc" }, take: 30 }),
    carregarCalendario(mesaId, { isNarrador: acesso.narrador }),
    prisma.diarioMarco.findMany({ where: { mesaId, ...(acesso.narrador ? {} : { autorId: acesso.userId }) }, orderBy: { nome: "asc" } }),
  ]);
  return {
    meuId: acesso.userId,
    fichas: fichas.map((f) => ({ id: f.id, nome: f.nome, tipo: normalizarTipoFicha(f.tipo), apelidos: f.apelidos })),
    marcos: marcos.map((m) => ({ id: m.id, nome: m.nome })),
    sessoes: sessoes.map((s) => ({
      id: s.id,
      numero: s.numero,
      titulo: s.titulo,
      iniciadaEm: s.iniciadaEm.toISOString(),
      encerradaEm: s.encerradaEm?.toISOString() ?? null,
      ativa: s.encerradaEm === null,
    })),
    calendario: cal
      ? {
          config: cal.config,
          hoje: cal.dataAtualDias,
          eventos: cal.eventos.map((e) => ({ id: e.id, titulo: e.titulo, dataDias: e.dataDias })),
        }
      : null,
  };
}
