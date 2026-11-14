// Linha do tempo do diário: cada sessão é um marco, e o que nasceu entre dois
// marcos (fichas, anotações) entra em ordem de criação. Puro: roda no cliente.

import type { FichaDiarioDTO, NotaDiarioDTO, SessaoDiarioDTO } from "@/lib/diario-tipos";

export type ItemLinha =
  | { k: "ficha"; id: string; criadaEm: string; ficha: FichaDiarioDTO }
  | { k: "nota"; id: string; criadaEm: string; nota: NotaDiarioDTO };

export type SecaoLinha = {
  // `sessao-<id>` ou `entre-<n>` (n = quantas sessões já começaram).
  id: string;
  sessao: SessaoDiarioDTO | null;
  // Só nas seções "entre": o texto do marco pequeno.
  rotulo: string;
  itens: ItemLinha[];
};

const ms = (iso: string) => new Date(iso).getTime();

const nomeCurto = (s: SessaoDiarioDTO) => (s.numero != null ? `${s.numero}` : new Date(s.iniciadaEm).toLocaleDateString("pt-BR"));

// Mais recente primeiro (o que se anota ao vivo fica no topo); dentro de cada
// seção, do mais antigo pro mais novo (lê-se como história).
export function montarLinha(
  sessoes: SessaoDiarioDTO[],
  fichas: FichaDiarioDTO[],
  notas: NotaDiarioDTO[],
): SecaoLinha[] {
  const asc = [...sessoes].sort((a, b) => ms(a.iniciadaEm) - ms(b.iniciadaEm));
  const n = asc.length;

  // Ordem cronológica: entre-0, sessão 0, entre-1, sessão 1, … entre-n.
  const secoes: SecaoLinha[] = [];
  for (let i = 0; i <= n; i++) {
    const antes = asc[i - 1];
    const depois = asc[i];
    secoes.push({
      id: `entre-${i}`,
      sessao: null,
      rotulo:
        n === 0
          ? "Diário"
          : !antes
            ? `Antes da sessão ${nomeCurto(depois)}`
            : !depois
              ? `Depois da sessão ${nomeCurto(antes)}`
              : `Entre as sessões ${nomeCurto(antes)} e ${nomeCurto(depois)}`,
      itens: [],
    });
    if (depois) secoes.push({ id: `sessao-${depois.id}`, sessao: depois, rotulo: "", itens: [] });
  }
  const porId = new Map(secoes.map((s) => [s.id, s]));

  // Dentro de uma sessão (do início ao fim, ou sem fim se ainda ativa) → ela;
  // fora de todas → o intervalo "entre" onde cai.
  const secaoPorTempo = (iso: string): SecaoLinha => {
    const t = ms(iso);
    const dentro = asc.find((s) => ms(s.iniciadaEm) <= t && (s.encerradaEm === null || t <= ms(s.encerradaEm)));
    if (dentro) return porId.get(`sessao-${dentro.id}`)!;
    const comecaram = asc.filter((s) => ms(s.iniciadaEm) <= t).length;
    return porId.get(`entre-${comecaram}`)!;
  };

  for (const f of fichas) secaoPorTempo(f.criadaEm).itens.push({ k: "ficha", id: f.id, criadaEm: f.criadaEm, ficha: f });
  for (const nt of notas) {
    // Anotação escolheu a sessão: fica nela, não importa a hora.
    const alvo = (nt.sessaoId && porId.get(`sessao-${nt.sessaoId}`)) || secaoPorTempo(nt.criadaEm);
    alvo.itens.push({ k: "nota", id: nt.id, criadaEm: nt.criadaEm, nota: nt });
  }
  for (const s of secoes) s.itens.sort((a, b) => ms(a.criadaEm) - ms(b.criadaEm));

  // Intervalo vazio some; sessão vazia fica (é um marco).
  return secoes.filter((s) => s.sessao || s.itens.length > 0).reverse();
}
