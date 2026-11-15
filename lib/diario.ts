// Diário de bordo: quem pode ler e escrever, e os backlinks. Só servidor.
//
// Regra única, usada em toda leitura e action:
//   lê      → o autor, o narrador da mesa, ou qualquer um se a linha é pública;
//   escreve → o autor; em linha pública, também o narrador e os `editores`.
// As tabelas ficam fora do Realtime e com RLS fechado (prisma/diario-rls.sql):
// o navegador nunca lê uma nota direto do banco.

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { referenciasDeRica } from "@/lib/descricao-rica";
import { tipoDoIdNovo } from "@/lib/diario-mencao";

export { podeApagarDiario, podeEscreverDiario, podeLerDiario, filtroLeituraDiario } from "@/lib/diario-permissao";
export type { AcessoDiario } from "@/lib/diario-permissao";
import type { AcessoDiario } from "@/lib/diario-permissao";

// null = não participa da mesa (nem narrador, nem jogador com ficha nela).
export async function acessoAoDiario(mesaId: string, userId: string): Promise<AcessoDiario | null> {
  const mesa = await prisma.mesa.findUnique({ where: { id: mesaId }, select: { userId: true } });
  if (!mesa) return null;
  if (mesa.userId === userId) return { userId, narrador: true };
  const membro = await prisma.personagem.findFirst({
    where: { userId, OR: [{ mesaId }, { dono: { mesaId } }] },
    select: { id: true },
  });
  return membro ? { userId, narrador: false } : null;
}

type OrigemTipo = "ficha" | "nota";
const ALVOS = ["ficha", "nota", "sessao", "dia", "evento", "marco"] as const;
type AlvoTipo = (typeof ALVOS)[number];

// Backlinks: relê o texto salvo e troca as menções da origem. Só vale alvo da
// própria mesa (um id de outra mesa colado no texto vira texto tracejado, sem ligação).
export async function recalcularMencoes(
  tx: Prisma.TransactionClient,
  mesaId: string,
  origemTipo: OrigemTipo,
  origemId: string,
  texto: string,
) {
  const refs = referenciasDeRica(texto).filter((r): r is { tipo: AlvoTipo; id: string } =>
    (ALVOS as readonly string[]).includes(r.tipo),
  );
  const ids = (t: AlvoTipo) => refs.filter((r) => r.tipo === t).map((r) => r.id);
  const [fichas, notas, sessoes, eventos, marcos] = await Promise.all([
    tx.diarioFicha.findMany({ where: { mesaId, id: { in: ids("ficha") } }, select: { id: true } }),
    tx.diarioNota.findMany({ where: { mesaId, id: { in: ids("nota") } }, select: { id: true } }),
    tx.sessao.findMany({ where: { mesaId, id: { in: ids("sessao") } }, select: { id: true } }),
    tx.eventoCalendario.findMany({ where: { id: { in: ids("evento") }, calendario: { mesaId } }, select: { id: true } }),
    tx.diarioMarco.findMany({ where: { mesaId, id: { in: ids("marco") } }, select: { id: true } }),
  ]);
  const validos = new Set([
    ...fichas.map((f) => `ficha:${f.id}`),
    ...notas.map((n) => `nota:${n.id}`),
    ...sessoes.map((s) => `sessao:${s.id}`),
    ...eventos.map((e) => `evento:${e.id}`),
    ...marcos.map((m) => `marco:${m.id}`),
    // Um dia do calendário não tem cadastro: vale qualquer número inteiro.
    ...ids("dia").filter((d) => /^-?\d{1,7}$/.test(d)).map((d) => `dia:${d}`),
  ]);
  await tx.diarioMencao.deleteMany({ where: { origemTipo, origemId } });
  const data = refs
    .filter((r) => validos.has(`${r.tipo}:${r.id}`) && !(r.tipo === origemTipo && r.id === origemId))
    .map((r) => ({ origemTipo, origemId, alvoTipo: r.tipo, alvoId: r.id }));
  if (data.length) await tx.diarioMencao.createMany({ data, skipDuplicates: true });
}

const RE_NOVO = /\[\[(ficha|marco):(novo:[^|\]\n]+)\|([^\]\n]*)\]\]/g;

// Menções a páginas e marcos que ainda não existiam (`ficha:novo:personagem:UUID`,
// `marco:novo:UUID`): nascem aqui, ao guardar. Reaproveita uma página que já tenha o
// mesmo nome e tipo (sua ou pública), pra não duplicar. Devolve o texto com os ids de verdade.
export async function resolverNovos(
  tx: Prisma.TransactionClient,
  mesaId: string,
  autorId: string,
  texto: string,
): Promise<string> {
  const achados = [...texto.matchAll(RE_NOVO)];
  if (achados.length === 0) return texto;
  const real = new Map<string, string | null>();
  for (const m of achados) {
    const chave = `${m[1]}:${m[2]}`;
    if (real.has(chave)) continue;
    const nome = m[3].trim().slice(0, 80);
    if (!nome) {
      real.set(chave, null);
      continue;
    }
    if (m[1] === "marco") {
      const igual = await tx.diarioMarco.findFirst({ where: { mesaId, autorId, nome: { equals: nome, mode: "insensitive" } } });
      real.set(chave, igual?.id ?? (await tx.diarioMarco.create({ data: { mesaId, autorId, nome } })).id);
      continue;
    }
    const tipo = tipoDoIdNovo(m[2]);
    if (!tipo) {
      real.set(chave, null);
      continue;
    }
    const igual = await tx.diarioFicha.findFirst({
      where: { mesaId, tipo, nome: { equals: nome, mode: "insensitive" }, OR: [{ autorId }, { visibilidade: "publica" }] },
    });
    real.set(chave, igual?.id ?? (await tx.diarioFicha.create({ data: { mesaId, autorId, tipo, nome } })).id);
  }
  return texto.replace(RE_NOVO, (_t, tipo: string, id: string, nome: string) => {
    const r = real.get(`${tipo}:${id}`);
    return r ? `[[${tipo}:${r}|${nome}]]` : nome;
  });
}
