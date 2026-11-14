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
const ALVOS = ["ficha", "nota", "sessao"] as const;
type AlvoTipo = (typeof ALVOS)[number];

// Backlinks: relê o texto salvo e troca as menções da origem. Só vale alvo da
// própria mesa (um id de outra mesa colado no texto vira chip morto, sem ligação).
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
  const [fichas, notas, sessoes] = await Promise.all([
    tx.diarioFicha.findMany({ where: { mesaId, id: { in: ids("ficha") } }, select: { id: true } }),
    tx.diarioNota.findMany({ where: { mesaId, id: { in: ids("nota") } }, select: { id: true } }),
    tx.sessao.findMany({ where: { mesaId, id: { in: ids("sessao") } }, select: { id: true } }),
  ]);
  const validos = new Set([
    ...fichas.map((f) => `ficha:${f.id}`),
    ...notas.map((n) => `nota:${n.id}`),
    ...sessoes.map((s) => `sessao:${s.id}`),
  ]);
  await tx.diarioMencao.deleteMany({ where: { origemTipo, origemId } });
  const data = refs
    .filter((r) => validos.has(`${r.tipo}:${r.id}`) && !(r.tipo === origemTipo && r.id === origemId))
    .map((r) => ({ origemTipo, origemId, alvoTipo: r.tipo, alvoId: r.id }));
  if (data.length) await tx.diarioMencao.createMany({ data, skipDuplicates: true });
}
