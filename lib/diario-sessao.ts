// Sessões anteriores ao sistema: onde elas entram na ordem do diário. Puro.
//
// A sessão retroativa não tem data de verdade. A linha do tempo ordena por `iniciadaEm`,
// então ela recebe um instante que a coloca na posição certa pelo NÚMERO: entre a vizinha
// de número menor e a de número maior. Quem registra 5 antes de 3 não bagunça nada.

export type SessaoOrdem = { numero: number | null; iniciadaEm: Date };

const SETE_DIAS = 7 * 24 * 60 * 60 * 1000;

export function instanteDaSessaoAnterior(numero: number, outras: SessaoOrdem[], agora: Date = new Date()): Date {
  const numeradas = outras.filter((s): s is { numero: number; iniciadaEm: Date } => s.numero !== null);
  const antes = numeradas.filter((s) => s.numero < numero).sort((a, b) => b.numero - a.numero)[0];
  const depois = numeradas.filter((s) => s.numero > numero).sort((a, b) => a.numero - b.numero)[0];

  if (antes && depois) {
    const a = antes.iniciadaEm.getTime();
    const d = depois.iniciadaEm.getTime();
    // Vizinhas fora de ordem (dados antigos): fica logo depois da menor.
    return new Date(d > a ? Math.floor((a + d) / 2) : a + 1000);
  }
  if (depois) return new Date(depois.iniciadaEm.getTime() - SETE_DIAS);
  if (antes) return new Date(antes.iniciadaEm.getTime() + 60_000);

  // Nenhuma sessão numerada: antes de tudo o que existe.
  const primeira = outras.reduce<number | null>((m, s) => (m === null || s.iniciadaEm.getTime() < m ? s.iniciadaEm.getTime() : m), null);
  return new Date((primeira ?? agora.getTime()) - SETE_DIAS);
}

// Sugestão pro campo "Número": a que falta logo abaixo da menor numerada (a 12ª sessão
// registrada no sistema sugere 11). Vazio quando não há o que sugerir.
export function numeroSugerido(numeros: (number | null)[]): number | null {
  const lista = numeros.filter((n): n is number => n !== null);
  if (lista.length === 0) return null;
  const menor = Math.min(...lista);
  return menor > 1 ? menor - 1 : null;
}
