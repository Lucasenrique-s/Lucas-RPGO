"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { avisarDiario } from "@/lib/diario-aovivo";
import { usuarioDaRequest } from "@/lib/supabase/server";
import { ErroDeUso, executar as executarEm } from "@/lib/acoes";
import { acessoAoDiario, podeApagarDiario, podeEscreverDiario, podeLerDiario, recalcularMencoes, resolverNovos, type AcessoDiario } from "@/lib/diario";
import { corValida } from "@/lib/diario-capa";
import { instanteDaSessaoAnterior } from "@/lib/diario-sessao";
import {
  LIMITES_DIARIO as L,
  RELACAO_FICHA,
  STATUS_FICHA,
  ehTipoFicha,
  type CamposFicha,
  type SessaoDiarioDTO,
  type TipoFichaDiario,
  type VersaoFichaDTO,
} from "@/lib/diario-tipos";

const executar = <T extends object = object>(corpo: () => Promise<T | void>) => executarEm("diario", corpo);

async function autorizar(mesaId: string): Promise<AcessoDiario> {
  const user = await usuarioDaRequest();
  if (!user) throw new ErroDeUso("Não autenticado.");
  const acesso = await acessoAoDiario(mesaId, user.id);
  if (!acesso) throw new ErroDeUso("Você não participa desta mesa.");
  return acesso;
}

// Revalida a página e avisa os outros da mesa (Broadcast sem conteúdo, depois da resposta).
const revalidar = (mesaId: string) => {
  revalidatePath(`/diario/${mesaId}`);
  after(() => avisarDiario(mesaId, { tipo: "ficha" }));
};

function texto(v: unknown, max: number, rotulo: string): string {
  if (typeof v !== "string") throw new ErroDeUso(`${rotulo} inválido.`);
  const t = v.trim();
  if (t.length > max) throw new ErroDeUso(`${rotulo} passa de ${max} caracteres.`);
  return t;
}

function lista(v: unknown, maxItens: number, maxTam: number, rotulo: string): string[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new ErroDeUso(`${rotulo} inválido.`);
  const out = [...new Set(v.map((x) => texto(x, maxTam, rotulo)).filter(Boolean))];
  if (out.length > maxItens) throw new ErroDeUso(`${rotulo}: no máximo ${maxItens}.`);
  return out;
}

function camposValidos(v: unknown): CamposFicha {
  const c = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const out: CamposFicha = {};
  if (typeof c.status === "string" && (STATUS_FICHA as readonly string[]).includes(c.status)) out.status = c.status;
  if (typeof c.relacao === "string" && (RELACAO_FICHA as readonly string[]).includes(c.relacao)) out.relacao = c.relacao;
  if (typeof c.visto === "string" && c.visto.trim()) out.visto = texto(c.visto, L.campo, "Campo \"visto em\"");
  return out;
}

// Retrato: só endereço http(s).
function urlOpcional(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const u = texto(v, 500, "Endereço da imagem");
  if (!/^https?:\/\//i.test(u)) throw new ErroDeUso("Endereço da imagem inválido.");
  return u;
}

// ─── Fichas ────────────────────────────────────────────────────

export type DadosFicha = {
  tipo: TipoFichaDiario;
  nome: string;
  apelidos?: string[];
  retratoUrl?: string | null;
  campos?: CamposFicha;
  resumo?: string;
};

function lerFicha(d: DadosFicha) {
  if (!ehTipoFicha(d.tipo)) throw new ErroDeUso("Tipo de ficha inválido.");
  const nome = texto(d.nome, L.nome, "Nome");
  if (!nome) throw new ErroDeUso("Dê um nome à ficha.");
  return {
    tipo: d.tipo,
    nome,
    apelidos: lista(d.apelidos, L.apelidos, L.apelido, "Apelidos"),
    retratoUrl: urlOpcional(d.retratoUrl),
    campos: camposValidos(d.campos) as Prisma.InputJsonValue,
    resumo: texto(d.resumo ?? "", L.texto, "Resumo"),
  };
}

export async function criarFichaDiario(mesaId: string, dados: DadosFicha) {
  return executar(async () => {
    const acesso = await autorizar(mesaId);
    const d = lerFicha(dados);
    const id = await prisma.$transaction(async (tx) => {
      const resumo = await resolverNovos(tx, mesaId, acesso.userId, d.resumo);
      const f = await tx.diarioFicha.create({ data: { ...d, resumo, mesaId, autorId: acesso.userId } });
      await recalcularMencoes(tx, mesaId, "ficha", f.id, resumo);
      return f.id;
    });
    revalidar(mesaId);
    return { id };
  });
}

export async function editarFichaDiario(mesaId: string, id: string, dados: DadosFicha) {
  return executar(async () => {
    const acesso = await autorizar(mesaId);
    const atual = await prisma.diarioFicha.findFirst({ where: { id, mesaId } });
    if (!atual || !podeEscreverDiario(acesso, atual)) throw new ErroDeUso("Ficha não encontrada.");
    const d = lerFicha(dados);
    await prisma.$transaction(async (tx) => {
      const resumo = await resolverNovos(tx, mesaId, acesso.userId, d.resumo);
      // Página pública: guarda o estado de antes, pra poder desfazer.
      if (atual.visibilidade === "publica") await guardarVersao(tx, atual, acesso.userId);
      await tx.diarioFicha.update({ where: { id }, data: { ...d, resumo } });
      await recalcularMencoes(tx, mesaId, "ficha", id, resumo);
    });
    revalidar(mesaId);
  });
}

export async function apagarFichaDiario(mesaId: string, id: string) {
  return executar(async () => {
    const acesso = await autorizar(mesaId);
    const atual = await prisma.diarioFicha.findFirst({ where: { id, mesaId } });
    if (!atual || !podeApagarDiario(acesso, atual)) throw new ErroDeUso("Ficha não encontrada.");
    if (atual.personagemId) {
      const vivo = await prisma.personagem.findFirst({ where: { id: atual.personagemId }, select: { id: true } });
      if (vivo) throw new ErroDeUso("Esta página acompanha o personagem e não pode ser apagada. Se não quiser que a mesa a veja, deixe-a privada.");
    }
    // Os @ que citavam a página ficam nos textos e passam a aparecer tracejados.
    await prisma.$transaction([
      prisma.diarioFicha.delete({ where: { id } }),
      prisma.diarioRelacao.deleteMany({ where: { OR: [{ deId: id }, { paraId: id }] } }),
      prisma.diarioMencao.deleteMany({
        where: { OR: [{ origemTipo: "ficha", origemId: id }, { alvoTipo: "ficha", alvoId: id }] },
      }),
    ]);
    revalidar(mesaId);
  });
}

// ─── Anotações ─────────────────────────────────────────────────

export type DadosNota = {
  // Opcional: aparece como título da anotação no caderno e na linha do tempo.
  titulo?: string;
  corpo: string;
  tags?: string[];
  importante?: boolean;
  // undefined = a sessão ativa (ou "Entre sessões", se não houver); null = Entre sessões.
  sessaoId?: string | null;
};

async function sessaoValida(mesaId: string, sessaoId: string): Promise<string> {
  const s = await prisma.sessao.findFirst({ where: { id: sessaoId, mesaId }, select: { id: true } });
  if (!s) throw new ErroDeUso("Sessão não encontrada.");
  return s.id;
}

function lerNota(d: DadosNota) {
  const corpo = texto(d.corpo, L.texto, "Anotação");
  if (!corpo) throw new ErroDeUso("Escreva alguma coisa.");
  return {
    titulo: texto(d.titulo ?? "", L.titulo, "Título") || null,
    corpo,
    tags: lista(d.tags?.map((t) => t.replace(/^#/, "")), L.tags, L.tag, "Tags"),
    importante: d.importante === true,
  };
}

export async function criarNotaDiario(mesaId: string, dados: DadosNota) {
  return executar(async () => {
    const acesso = await autorizar(mesaId);
    const d = lerNota(dados);
    let sessaoId: string | null;
    if (dados.sessaoId === undefined) {
      sessaoId =
        (await prisma.sessao.findFirst({ where: { mesaId, encerradaEm: null }, select: { id: true } }))?.id ?? null;
    } else {
      sessaoId = dados.sessaoId === null ? null : await sessaoValida(mesaId, dados.sessaoId);
    }
    // Data do jogo no calendário da mesa (se houver), pra ordenar dentro da história.
    const cal = await prisma.calendario.findUnique({ where: { mesaId }, select: { dataAtualDias: true } });
    const id = await prisma.$transaction(async (tx) => {
      // Páginas e marcos mencionados mas ainda inexistentes nascem aqui, ao guardar.
      const corpo = await resolverNovos(tx, mesaId, acesso.userId, d.corpo);
      const n = await tx.diarioNota.create({
        data: { ...d, corpo, mesaId, autorId: acesso.userId, sessaoId, diaJogo: cal?.dataAtualDias ?? null },
      });
      await recalcularMencoes(tx, mesaId, "nota", n.id, corpo);
      return n.id;
    });
    revalidar(mesaId);
    return { id };
  });
}

export async function editarNotaDiario(mesaId: string, id: string, dados: DadosNota) {
  return executar(async () => {
    const acesso = await autorizar(mesaId);
    const atual = await prisma.diarioNota.findFirst({ where: { id, mesaId } });
    if (!atual || !podeEscreverDiario(acesso, atual)) throw new ErroDeUso("Anotação não encontrada.");
    const d = lerNota(dados);
    const sessaoId =
      dados.sessaoId === undefined
        ? atual.sessaoId
        : dados.sessaoId === null
          ? null
          : await sessaoValida(mesaId, dados.sessaoId);
    await prisma.$transaction(async (tx) => {
      const corpo = await resolverNovos(tx, mesaId, acesso.userId, d.corpo);
      await tx.diarioNota.update({ where: { id }, data: { ...d, corpo, sessaoId } });
      await recalcularMencoes(tx, mesaId, "nota", id, corpo);
    });
    revalidar(mesaId);
  });
}

export async function apagarNotaDiario(mesaId: string, id: string) {
  return executar(async () => {
    const acesso = await autorizar(mesaId);
    const atual = await prisma.diarioNota.findFirst({ where: { id, mesaId } });
    if (!atual || !podeApagarDiario(acesso, atual)) throw new ErroDeUso("Anotação não encontrada.");
    await prisma.$transaction([
      prisma.diarioNota.delete({ where: { id } }),
      prisma.diarioMencao.deleteMany({
        where: { OR: [{ origemTipo: "nota", origemId: id }, { alvoTipo: "nota", alvoId: id }] },
      }),
    ]);
    revalidar(mesaId);
  });
}

// Apaga várias fichas e anotações de uma vez. Vale a regra de cada uma (o autor, ou o narrador
// no que é público); o que não puder ser apagado fica e é contado em `ignoradas`. A página que
// acompanha um personagem existente também fica.
export async function apagarVariosDiario(mesaId: string, fichaIds: string[], notaIds: string[]) {
  return executar(async (): Promise<{ apagadas: number; ignoradas: number }> => {
    const acesso = await autorizar(mesaId);
    const fIds = lista(fichaIds, 500, 80, "Fichas");
    const nIds = lista(notaIds, 500, 80, "Anotações");
    const [fichas, notas] = await Promise.all([
      prisma.diarioFicha.findMany({ where: { mesaId, id: { in: fIds } } }),
      prisma.diarioNota.findMany({ where: { mesaId, id: { in: nIds } } }),
    ]);
    const vivos = new Set(
      (
        await prisma.personagem.findMany({
          where: { id: { in: fichas.flatMap((f) => (f.personagemId ? [f.personagemId] : [])) } },
          select: { id: true },
        })
      ).map((p) => p.id),
    );
    const okF = fichas.filter((f) => podeApagarDiario(acesso, f) && !(f.personagemId && vivos.has(f.personagemId))).map((f) => f.id);
    const okN = notas.filter((n) => podeApagarDiario(acesso, n)).map((n) => n.id);
    await prisma.$transaction([
      prisma.diarioFicha.deleteMany({ where: { id: { in: okF } } }),
      prisma.diarioRelacao.deleteMany({ where: { OR: [{ deId: { in: okF } }, { paraId: { in: okF } }] } }),
      prisma.diarioNota.deleteMany({ where: { id: { in: okN } } }),
      prisma.diarioMencao.deleteMany({
        where: {
          OR: [
            { origemTipo: "ficha", origemId: { in: okF } },
            { alvoTipo: "ficha", alvoId: { in: okF } },
            { origemTipo: "nota", origemId: { in: okN } },
            { alvoTipo: "nota", alvoId: { in: okN } },
          ],
        },
      }),
    ]);
    revalidar(mesaId);
    const pedidas = fIds.length + nIds.length;
    return { apagadas: okF.length + okN.length, ignoradas: pedidas - okF.length - okN.length };
  });
}

// ─── Sessão ────────────────────────────────────────────────────

// Número e título da sessão ("Sessão 12: A fuga de Enies Lobby"): só o narrador.
export async function nomearSessaoDiario(mesaId: string, sessaoId: string, numero: number | null, titulo: string) {
  return executar(async () => {
    const acesso = await autorizar(mesaId);
    if (!acesso.narrador) throw new ErroDeUso("Só o narrador nomeia a sessão.");
    await sessaoValida(mesaId, sessaoId);
    if (numero !== null && (!Number.isInteger(numero) || numero < 1 || numero > 9999)) {
      throw new ErroDeUso("Número de sessão inválido.");
    }
    await prisma.sessao.update({
      where: { id: sessaoId },
      data: { numero, titulo: texto(titulo, L.titulo, "Título") || null },
    });
    revalidar(mesaId);
  });
}

// Registra uma sessão jogada ANTES do sistema, pra a pessoa poder anotar o que aconteceu
// nela. Qualquer participante registra (o narrador corrige nome e número depois). Não tem
// data real: a ordem vem do número (lib/diario-sessao.ts) e ela nasce encerrada.
export async function criarSessaoAnteriorDiario(mesaId: string, dados: { numero: number; titulo?: string }) {
  return executar(async (): Promise<{ sessao: SessaoDiarioDTO }> => {
    await autorizar(mesaId);
    const { numero } = dados;
    if (!Number.isInteger(numero) || numero < 1 || numero > 9999) throw new ErroDeUso("Número de sessão inválido.");
    const titulo = texto(dados.titulo ?? "", L.titulo, "Título") || null;

    const outras = await prisma.sessao.findMany({ where: { mesaId }, select: { numero: true, iniciadaEm: true } });
    if (outras.some((s) => s.numero === numero)) {
      throw new ErroDeUso(`A sessão ${numero} já está registrada. Escolha a anotação nela, ou peça ao narrador para mudar o número dela.`);
    }

    const quando = instanteDaSessaoAnterior(numero, outras);
    const s = await prisma.sessao.create({
      data: { mesaId, numero, titulo, retroativa: true, iniciadaEm: quando, encerradaEm: quando },
    });
    revalidar(mesaId);
    return {
      sessao: {
        id: s.id,
        numero: s.numero,
        titulo: s.titulo,
        iniciadaEm: s.iniciadaEm.toISOString(),
        encerradaEm: s.encerradaEm?.toISOString() ?? null,
        ativa: false,
        retroativa: true,
      },
    };
  });
}

// ─── Caderno ───────────────────────────────────────────────────

// A cor da capa do PRÓPRIO caderno (cada jogador tem a sua, por mesa).
export async function definirCapaDiario(mesaId: string, cor: string) {
  return executar(async () => {
    const acesso = await autorizar(mesaId);
    if (!corValida(cor)) throw new ErroDeUso("Cor inválida.");
    const capaCor = cor.toLowerCase();
    await prisma.diarioCaderno.upsert({
      where: { mesaId_userId: { mesaId, userId: acesso.userId } },
      create: { mesaId, userId: acesso.userId, capaCor },
      update: { capaCor },
    });
    revalidatePath(`/diario/${mesaId}`);
  });
}

// ─── Visibilidade ──────────────────────────────────────────────

export type Visibilidade = "privada" | "publica";
// Na wiki o narrador ainda tem a página "oculta": só ele a vê, até revelar.
export type VisibilidadeFicha = Visibilidade | "oculta";

// Em que sessão a página entrou na wiki: a ativa, ou a última.
async function sessaoParaRevelar(tx: Prisma.TransactionClient, mesaId: string): Promise<string | null> {
  const s = await tx.sessao.findFirst({ where: { mesaId, retroativa: false }, orderBy: [{ encerradaEm: { sort: "asc", nulls: "first" } }, { iniciadaEm: "desc" }], select: { id: true } });
  return s?.id ?? null;
}

// Marca quais anotações DO AUTOR aparecem na página pública. Só vale pra anotação dele.
async function gravarNotasWiki(tx: Prisma.TransactionClient, mesaId: string, autorId: string, fichaId: string, notaIds: string[]) {
  const minhas = await tx.diarioNota.findMany({ where: { mesaId, autorId, id: { in: notaIds } }, select: { id: true } });
  await tx.diarioWikiNota.deleteMany({ where: { fichaId, nota: { autorId } } });
  if (minhas.length) await tx.diarioWikiNota.createMany({ data: minhas.map((n) => ({ fichaId, notaId: n.id })), skipDuplicates: true });
}

const MAX_VERSOES = 30;

// Guarda o estado atual da página antes de uma edição; mantém só as últimas versões.
async function guardarVersao(
  tx: Prisma.TransactionClient,
  f: { id: string; nome: string; apelidos: string[]; campos: Prisma.JsonValue; resumo: string },
  editorId: string,
) {
  await tx.diarioFichaVersao.create({
    data: { fichaId: f.id, editorId, nome: f.nome, apelidos: f.apelidos, campos: (f.campos ?? {}) as Prisma.InputJsonValue, resumo: f.resumo },
  });
  const velhas = await tx.diarioFichaVersao.findMany({
    where: { fichaId: f.id },
    orderBy: { criadaEm: "desc" },
    skip: MAX_VERSOES,
    select: { id: true },
  });
  if (velhas.length) await tx.diarioFichaVersao.deleteMany({ where: { id: { in: velhas.map((v) => v.id) } } });
}

// Torna uma ficha pública (ou privada de novo). Só o autor. Publicar uma ficha
// com o mesmo nome de uma pública já existente devolve o conflito: o cliente
// pergunta e chama `mesclarFichaDiario` ou repete com `ignorarConflito`.
//
// `notaIds`: as anotações do autor que aparecem em "Anotações da mesa" (o "o que eu sei"
// nunca vai sozinho: só vai o que ele marcar). Duas pessoas publicando o mesmo nome ao
// mesmo tempo: a trava abaixo serializa, e a segunda cai no conflito (fluxo de mesclar).
export async function publicarFichaDiario(
  mesaId: string,
  id: string,
  visibilidade: VisibilidadeFicha,
  ignorarConflito = false,
  notaIds: string[] = [],
) {
  return executar(async (): Promise<{ conflito?: { id: string; nome: string } }> => {
    const acesso = await autorizar(mesaId);
    if (visibilidade !== "privada" && visibilidade !== "publica" && visibilidade !== "oculta") throw new ErroDeUso("Visibilidade inválida.");
    if (visibilidade === "oculta" && !acesso.narrador) throw new ErroDeUso("Só o narrador guarda páginas ocultas na wiki.");
    const ids = lista(notaIds, 200, 80, "Anotações");
    const r = await prisma.$transaction(async (tx) => {
      const f = await tx.diarioFicha.findFirst({ where: { id, mesaId } });
      if (!f || f.autorId !== acesso.userId) throw new ErroDeUso("Só o autor muda a visibilidade da ficha.");
      if (visibilidade === "publica" && f.visibilidade !== "publica") {
        // Trava por mesa+nome até o fim da transação: a segunda publicação já enxerga a primeira.
        await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${mesaId + ":" + f.nome.toLowerCase()}))`;
        if (!ignorarConflito) {
          const igual = await tx.diarioFicha.findFirst({
            where: { mesaId, visibilidade: "publica", nome: { equals: f.nome, mode: "insensitive" }, id: { not: id } },
            select: { id: true, nome: true },
          });
          if (igual) return { conflito: igual };
        }
      }
      const entrando = visibilidade === "publica" && f.visibilidade !== "publica";
      await tx.diarioFicha.update({
        where: { id },
        data: {
          visibilidade,
          // Voltar a privada tira os editores extras: ninguém mais edita o que é só do autor.
          ...(visibilidade !== "publica" ? { editores: [], reveladaSessaoId: null, reveladaEm: null } : {}),
          ...(entrando ? { reveladaSessaoId: await sessaoParaRevelar(tx, mesaId), reveladaEm: new Date() } : {}),
        },
      });
      if (visibilidade === "publica") await gravarNotasWiki(tx, mesaId, acesso.userId, id, ids);
      else await tx.diarioWikiNota.deleteMany({ where: { fichaId: id } });
      return {};
    });
    revalidar(mesaId);
    return r;
  });
}

// O narrador revela uma página oculta à mesa (ela passa a ser pública, "revelada na Sessão N").
export async function revelarFichaDiario(mesaId: string, id: string) {
  return executar(async () => {
    const acesso = await autorizar(mesaId);
    if (!acesso.narrador) throw new ErroDeUso("Só o narrador revela páginas.");
    await prisma.$transaction(async (tx) => {
      const f = await tx.diarioFicha.findFirst({ where: { id, mesaId } });
      if (!f || f.visibilidade !== "oculta") throw new ErroDeUso("Página oculta não encontrada.");
      await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${mesaId + ":" + f.nome.toLowerCase()}))`;
      await tx.diarioFicha.update({
        where: { id },
        data: { visibilidade: "publica", reveladaSessaoId: await sessaoParaRevelar(tx, mesaId), reveladaEm: new Date() },
      });
    });
    revalidar(mesaId);
  });
}

// Escolhe quais anotações MINHAS aparecem na página pública (qualquer participante, na própria parte).
export async function definirNotasWikiDiario(mesaId: string, fichaId: string, notaIds: string[]) {
  return executar(async () => {
    const acesso = await autorizar(mesaId);
    const ficha = await prisma.diarioFicha.findFirst({ where: { id: fichaId, mesaId, visibilidade: "publica" }, select: { id: true } });
    if (!ficha) throw new ErroDeUso("Página pública não encontrada.");
    const ids = lista(notaIds, 200, 80, "Anotações");
    await prisma.$transaction((tx) => gravarNotasWiki(tx, mesaId, acesso.userId, fichaId, ids));
    revalidar(mesaId);
  });
}

// Versões antigas de uma página que a pessoa pode ler (as mais novas primeiro).
export async function listarVersoesFichaDiario(mesaId: string, fichaId: string) {
  return executar(async (): Promise<{ versoes: VersaoFichaDTO[] }> => {
    const acesso = await autorizar(mesaId);
    const f = await prisma.diarioFicha.findFirst({ where: { id: fichaId, mesaId } });
    if (!f || !podeLerDiario(acesso, f)) throw new ErroDeUso("Página não encontrada.");
    const v = await prisma.diarioFichaVersao.findMany({ where: { fichaId }, orderBy: { criadaEm: "desc" }, take: MAX_VERSOES });
    return { versoes: v.map((x) => ({ id: x.id, editorId: x.editorId, nome: x.nome, resumo: x.resumo, criadaEm: x.criadaEm.toISOString() })) };
  });
}

// Desfazer: volta a página àquela versão. O estado de agora também vira uma versão (dá pra refazer).
export async function restaurarVersaoFichaDiario(mesaId: string, versaoId: string) {
  return executar(async () => {
    const acesso = await autorizar(mesaId);
    const v = await prisma.diarioFichaVersao.findUnique({ where: { id: versaoId } });
    if (!v) throw new ErroDeUso("Versão não encontrada.");
    await prisma.$transaction(async (tx) => {
      const f = await tx.diarioFicha.findFirst({ where: { id: v.fichaId, mesaId } });
      if (!f || !podeEscreverDiario(acesso, f)) throw new ErroDeUso("Página não encontrada.");
      await guardarVersao(tx, f, acesso.userId);
      await tx.diarioFicha.update({ where: { id: f.id }, data: { nome: v.nome, apelidos: v.apelidos, campos: (v.campos ?? {}) as Prisma.InputJsonValue, resumo: v.resumo } });
      await recalcularMencoes(tx, mesaId, "ficha", f.id, v.resumo);
    });
    revalidar(mesaId);
  });
}

// Mescla a ficha do autor numa ficha pública que já existe, sem mexer no texto
// de ninguém: as menções dele passam a apontar pra pública, o resumo dele vira
// uma anotação privada sobre ela, e a ficha duplicada some.
export async function mesclarFichaDiario(mesaId: string, id: string, destinoId: string, notaIds: string[] = []) {
  return executar(async () => {
    const acesso = await autorizar(mesaId);
    const [f, alvo] = await Promise.all([
      prisma.diarioFicha.findFirst({ where: { id, mesaId } }),
      prisma.diarioFicha.findFirst({ where: { id: destinoId, mesaId, visibilidade: "publica" } }),
    ]);
    if (!f || f.autorId !== acesso.userId) throw new ErroDeUso("Só o autor mescla a própria ficha.");
    if (!alvo || alvo.id === f.id) throw new ErroDeUso("Ficha pública não encontrada.");

    const de = `[[ficha:${f.id}|`;
    const para = `[[ficha:${alvo.id}|`;
    const ativa = await prisma.sessao.findFirst({ where: { mesaId, encerradaEm: null }, select: { id: true } });

    await prisma.$transaction(async (tx) => {
      // Textos do próprio autor que citavam a ficha duplicada.
      const notas = await tx.diarioNota.findMany({ where: { mesaId, autorId: acesso.userId, corpo: { contains: de } } });
      for (const n of notas) {
        const corpo = n.corpo.split(de).join(para);
        await tx.diarioNota.update({ where: { id: n.id }, data: { corpo } });
        await recalcularMencoes(tx, mesaId, "nota", n.id, corpo);
      }
      const fichas = await tx.diarioFicha.findMany({
        where: { mesaId, autorId: acesso.userId, resumo: { contains: de }, id: { not: f.id } },
      });
      for (const o of fichas) {
        const resumo = o.resumo.split(de).join(para);
        await tx.diarioFicha.update({ where: { id: o.id }, data: { resumo } });
        await recalcularMencoes(tx, mesaId, "ficha", o.id, resumo);
      }
      // O que ele sabia vira anotação privada sobre a ficha pública.
      if (f.resumo.trim()) {
        const corpo = `Sobre ${para}${alvo.nome}]]:
${f.resumo}`.slice(0, L.texto);
        const n = await tx.diarioNota.create({
          data: { mesaId, autorId: acesso.userId, sessaoId: ativa?.id ?? null, corpo },
        });
        await recalcularMencoes(tx, mesaId, "nota", n.id, corpo);
      }
      await tx.diarioMencao.deleteMany({
        where: { OR: [{ origemTipo: "ficha", origemId: f.id }, { alvoTipo: "ficha", alvoId: f.id }] },
      });
      await tx.diarioFicha.delete({ where: { id: f.id } });
      // As anotações que ele marcou passam a aparecer na página pública.
      const marcadas = lista(notaIds, 200, 80, "Anotações");
      if (marcadas.length) await gravarNotasWiki(tx, mesaId, acesso.userId, alvo.id, marcadas);
    });
    revalidar(mesaId);
    return { destinoId: alvo.id };
  });
}

export async function publicarNotaDiario(mesaId: string, id: string, visibilidade: Visibilidade) {
  return executar(async () => {
    const acesso = await autorizar(mesaId);
    const n = await prisma.diarioNota.findFirst({ where: { id, mesaId } });
    if (!n || n.autorId !== acesso.userId) throw new ErroDeUso("Só o autor muda a visibilidade da anotação.");
    if (visibilidade !== "privada" && visibilidade !== "publica") throw new ErroDeUso("Visibilidade inválida.");
    await prisma.diarioNota.update({ where: { id }, data: { visibilidade } });
    revalidar(mesaId);
  });
}

// Quem mais edita a ficha pública (além do autor e do narrador). Só o autor.
export async function definirEditoresFichaDiario(mesaId: string, id: string, editores: string[]) {
  return executar(async () => {
    const acesso = await autorizar(mesaId);
    const f = await prisma.diarioFicha.findFirst({ where: { id, mesaId } });
    if (!f || f.autorId !== acesso.userId) throw new ErroDeUso("Só o autor escolhe os editores.");
    if (f.visibilidade !== "publica") throw new ErroDeUso("Publique a ficha antes de escolher editores.");
    const ids = lista(editores, 30, 80, "Editores").filter((u) => u !== acesso.userId);
    // Só quem participa da mesa pode virar editor.
    const validos: string[] = [];
    for (const u of ids) if (await acessoAoDiario(mesaId, u)) validos.push(u);
    await prisma.diarioFicha.update({ where: { id }, data: { editores: validos } });
    revalidar(mesaId);
  });
}

// ─── Retratos (vários por página) ──────────────────────────────

const MAX_RETRATOS = 12;

async function fichaEditavel(mesaId: string, fichaId: string) {
  const acesso = await autorizar(mesaId);
  const f = await prisma.diarioFicha.findFirst({ where: { id: fichaId, mesaId } });
  if (!f || !podeEscreverDiario(acesso, f)) throw new ErroDeUso("Página não encontrada.");
  return { acesso, f };
}

export async function adicionarRetratoDiario(mesaId: string, fichaId: string, url: string, legenda = "") {
  return executar(async () => {
    await fichaEditavel(mesaId, fichaId);
    const u = urlOpcional(url);
    if (!u) throw new ErroDeUso("Endereço da imagem inválido.");
    const total = await prisma.diarioRetrato.count({ where: { fichaId } });
    if (total >= MAX_RETRATOS) throw new ErroDeUso(`No máximo ${MAX_RETRATOS} retratos por página.`);
    const ultimo = await prisma.diarioRetrato.findFirst({ where: { fichaId }, orderBy: { ordem: "desc" }, select: { ordem: true } });
    const r = await prisma.diarioRetrato.create({
      data: { fichaId, url: u, legenda: texto(legenda, 120, "Legenda"), ordem: (ultimo?.ordem ?? -1) + 1 },
    });
    revalidar(mesaId);
    return { id: r.id };
  });
}

export async function atualizarRetratoDiario(mesaId: string, retratoId: string, mudanca: { legenda?: string; principal?: boolean }) {
  return executar(async () => {
    const r = await prisma.diarioRetrato.findUnique({ where: { id: retratoId } });
    if (!r) throw new ErroDeUso("Retrato não encontrado.");
    await fichaEditavel(mesaId, r.fichaId);
    const data: { legenda?: string; ordem?: number } = {};
    if (mudanca.legenda !== undefined) data.legenda = texto(mudanca.legenda, 120, "Legenda");
    if (mudanca.principal) {
      const primeiro = await prisma.diarioRetrato.findFirst({ where: { fichaId: r.fichaId }, orderBy: { ordem: "asc" }, select: { ordem: true } });
      data.ordem = (primeiro?.ordem ?? 0) - 1;
    }
    await prisma.diarioRetrato.update({ where: { id: retratoId }, data });
    revalidar(mesaId);
  });
}

export async function removerRetratoDiario(mesaId: string, retratoId: string) {
  return executar(async () => {
    const r = await prisma.diarioRetrato.findUnique({ where: { id: retratoId } });
    if (!r) throw new ErroDeUso("Retrato não encontrado.");
    await fichaEditavel(mesaId, r.fichaId);
    await prisma.diarioRetrato.delete({ where: { id: retratoId } });
    revalidar(mesaId);
  });
}

// ─── Relações entre páginas ────────────────────────────────────

export async function adicionarRelacaoDiario(mesaId: string, deId: string, verbo: string, paraId: string) {
  return executar(async () => {
    const { acesso } = await fichaEditavel(mesaId, deId);
    const v = texto(verbo, 40, "Relação");
    if (!v) throw new ErroDeUso("Diga a relação (ex.: aliado de).");
    if (deId === paraId) throw new ErroDeUso("Uma página não se relaciona consigo mesma.");
    const alvo = await prisma.diarioFicha.findFirst({ where: { id: paraId, mesaId } });
    if (!alvo || !podeLerDiario(acesso, alvo)) throw new ErroDeUso("Página de destino não encontrada.");
    const igual = await prisma.diarioRelacao.findFirst({ where: { mesaId, deId, paraId, verbo: { equals: v, mode: "insensitive" } } });
    if (igual) return { id: igual.id };
    const r = await prisma.diarioRelacao.create({ data: { mesaId, deId, verbo: v, paraId } });
    revalidar(mesaId);
    return { id: r.id };
  });
}

export async function removerRelacaoDiario(mesaId: string, relacaoId: string) {
  return executar(async () => {
    const r = await prisma.diarioRelacao.findFirst({ where: { id: relacaoId, mesaId } });
    if (!r) throw new ErroDeUso("Relação não encontrada.");
    await fichaEditavel(mesaId, r.deId);
    await prisma.diarioRelacao.delete({ where: { id: relacaoId } });
    revalidar(mesaId);
  });
}
