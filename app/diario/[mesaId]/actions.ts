"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { avisarDiario } from "@/lib/diario-aovivo";
import { usuarioDaRequest } from "@/lib/supabase/server";
import { ErroDeUso, executar as executarEm } from "@/lib/acoes";
import { acessoAoDiario, podeApagarDiario, podeEscreverDiario, recalcularMencoes, type AcessoDiario } from "@/lib/diario";
import {
  LIMITES_DIARIO as L,
  RELACAO_FICHA,
  STATUS_FICHA,
  ehTipoFicha,
  type CamposFicha,
  type TipoFichaDiario,
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
      const f = await tx.diarioFicha.create({ data: { ...d, mesaId, autorId: acesso.userId } });
      await recalcularMencoes(tx, mesaId, "ficha", f.id, d.resumo);
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
      await tx.diarioFicha.update({ where: { id }, data: d });
      await recalcularMencoes(tx, mesaId, "ficha", id, d.resumo);
    });
    revalidar(mesaId);
  });
}

export async function apagarFichaDiario(mesaId: string, id: string) {
  return executar(async () => {
    const acesso = await autorizar(mesaId);
    const atual = await prisma.diarioFicha.findFirst({ where: { id, mesaId } });
    if (!atual || !podeApagarDiario(acesso, atual)) throw new ErroDeUso("Ficha não encontrada.");
    await prisma.$transaction([
      prisma.diarioFicha.delete({ where: { id } }),
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
      const n = await tx.diarioNota.create({
        data: { ...d, mesaId, autorId: acesso.userId, sessaoId, diaJogo: cal?.dataAtualDias ?? null },
      });
      await recalcularMencoes(tx, mesaId, "nota", n.id, d.corpo);
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
      await tx.diarioNota.update({ where: { id }, data: { ...d, sessaoId } });
      await recalcularMencoes(tx, mesaId, "nota", id, d.corpo);
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

// ─── Visibilidade ──────────────────────────────────────────────

export type Visibilidade = "privada" | "publica";

// Torna uma ficha pública (ou privada de novo). Só o autor. Publicar uma ficha
// com o mesmo nome de uma pública já existente devolve o conflito: o cliente
// pergunta e chama `mesclarFichaDiario` ou repete com `ignorarConflito`.
export async function publicarFichaDiario(
  mesaId: string,
  id: string,
  visibilidade: Visibilidade,
  ignorarConflito = false,
) {
  return executar(async (): Promise<{ conflito?: { id: string; nome: string } }> => {
    const acesso = await autorizar(mesaId);
    const f = await prisma.diarioFicha.findFirst({ where: { id, mesaId } });
    if (!f || f.autorId !== acesso.userId) throw new ErroDeUso("Só o autor muda a visibilidade da ficha.");
    if (visibilidade !== "privada" && visibilidade !== "publica") throw new ErroDeUso("Visibilidade inválida.");
    if (visibilidade === "publica" && f.visibilidade !== "publica" && !ignorarConflito) {
      const igual = await prisma.diarioFicha.findFirst({
        where: { mesaId, visibilidade: "publica", nome: { equals: f.nome, mode: "insensitive" }, id: { not: id } },
        select: { id: true, nome: true },
      });
      if (igual) return { conflito: igual };
    }
    await prisma.diarioFicha.update({
      where: { id },
      // Voltar a privada tira os editores extras: ninguém mais edita o que é só do autor.
      data: { visibilidade, ...(visibilidade === "privada" ? { editores: [] } : {}) },
    });
    revalidar(mesaId);
    return {};
  });
}

// Mescla a ficha do autor numa ficha pública que já existe, sem mexer no texto
// de ninguém: as menções dele passam a apontar pra pública, o resumo dele vira
// uma anotação privada sobre ela, e a ficha duplicada some.
export async function mesclarFichaDiario(mesaId: string, id: string, destinoId: string) {
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
