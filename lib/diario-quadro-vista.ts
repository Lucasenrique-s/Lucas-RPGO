// Formas de olhar o quadro: modo investigação (grafo), camadas por sessão e busca. Puro (sem React, sem banco).

export type LigacaoGrafo = { id: string; de: string; para: string };
export type Alcance = { nos: Set<string>; ligacoes: Set<string> };

// As ligações valem nos dois sentidos: investigar é seguir o fio, não a seta.
function vizinhanca(ligacoes: LigacaoGrafo[]): Map<string, { no: string; ligacao: string }[]> {
  const m = new Map<string, { no: string; ligacao: string }[]>();
  const poe = (a: string, b: string, id: string) => {
    const l = m.get(a);
    if (l) l.push({ no: b, ligacao: id });
    else m.set(a, [{ no: b, ligacao: id }]);
  };
  for (const l of ligacoes) {
    poe(l.de, l.para, l.id);
    poe(l.para, l.de, l.id);
  }
  return m;
}

// Tudo o que se liga a `inicio`, direta ou indiretamente (o "bando" dele).
export function componenteDe(inicio: string, ligacoes: LigacaoGrafo[]): Alcance {
  const viz = vizinhanca(ligacoes);
  const nos = new Set<string>([inicio]);
  const usadas = new Set<string>();
  const fila = [inicio];
  while (fila.length > 0) {
    const atual = fila.shift() as string;
    for (const v of viz.get(atual) ?? []) {
      usadas.add(v.ligacao);
      if (!nos.has(v.no)) {
        nos.add(v.no);
        fila.push(v.no);
      }
    }
  }
  return { nos, ligacoes: usadas };
}

// O caminho mais curto entre dois cartões, pelos fios; null se não há.
export function caminhoMaisCurto(a: string, b: string, ligacoes: LigacaoGrafo[]): { nos: string[]; ligacoes: string[] } | null {
  if (a === b) return { nos: [a], ligacoes: [] };
  const viz = vizinhanca(ligacoes);
  const veioDe = new Map<string, { no: string; ligacao: string }>();
  const visto = new Set<string>([a]);
  const fila = [a];
  while (fila.length > 0) {
    const atual = fila.shift() as string;
    for (const v of viz.get(atual) ?? []) {
      if (visto.has(v.no)) continue;
      visto.add(v.no);
      veioDe.set(v.no, { no: atual, ligacao: v.ligacao });
      if (v.no === b) {
        const nos = [b];
        const fios: string[] = [];
        let p = b;
        while (p !== a) {
          const anterior = veioDe.get(p) as { no: string; ligacao: string };
          fios.unshift(anterior.ligacao);
          nos.unshift(anterior.no);
          p = anterior.no;
        }
        return { nos, ligacoes: fios };
      }
      fila.push(v.no);
    }
  }
  return null;
}

// Camadas por sessão ("mostrar só até a sessão 8"): o cartão aparece se nasceu até a sessão escolhida.
// `ordem` são os ids das sessões, da mais antiga para a mais nova. Sem sessão (nasceu "entre sessões" ou antes
// de existirem camadas) sempre aparece; `limite` nulo mostra tudo.
export function visivelNaCamada(sessaoDoCartao: string | null, ordem: string[], limite: number | null): boolean {
  if (limite === null || sessaoDoCartao === null) return true;
  const i = ordem.indexOf(sessaoDoCartao);
  return i < 0 || i <= limite;
}

// Busca sem acento e sem caixa.
export const normalizarBusca = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export const combinaBusca = (texto: string, termo: string) => {
  const t = normalizarBusca(termo);
  return t !== "" && normalizarBusca(texto).includes(t);
};
