// Regras de permissão do diário, puras (sem banco): servidor e testes usam as mesmas.
//   lê      → o autor, o narrador da mesa, ou qualquer um se a linha é pública;
//   escreve → o autor; em linha pública, também o narrador e os `editores`;
//   apaga   → o autor, ou o narrador quando a linha é pública.

export type AcessoDiario = { userId: string; narrador: boolean };

export type LinhaDiario = { autorId: string; visibilidade: string; editores?: string[] };

export const podeLerDiario = (a: AcessoDiario, l: LinhaDiario) =>
  a.narrador || l.autorId === a.userId || l.visibilidade === "publica";

export const podeEscreverDiario = (a: AcessoDiario, l: LinhaDiario) =>
  l.autorId === a.userId ||
  (l.visibilidade === "publica" && (a.narrador || (l.editores?.includes(a.userId) ?? false)));

export const podeApagarDiario = (a: AcessoDiario, l: LinhaDiario) =>
  l.autorId === a.userId || (a.narrador && l.visibilidade === "publica");

// Filtro Prisma equivalente a `podeLerDiario`.
export function filtroLeituraDiario(a: AcessoDiario): { OR?: { autorId?: string; visibilidade?: string }[] } {
  return a.narrador ? {} : { OR: [{ autorId: a.userId }, { visibilidade: "publica" }] };
}
