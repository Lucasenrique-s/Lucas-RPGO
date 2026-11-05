// Motor de layout do overlay de gravação (docs/plano-gravacao-obs.md, Fase 1).
// Função pura: cards + modo + mapa → retângulos em 1920×1080. Sem React, pra
// prévia, overlay e (na Fase 6) a fonte do mapa no OBS usarem a mesma conta.
//
// A tela vira, no máximo, duas regiões: a do mapa (16:9) e a dos cards. Dentro
// da região dos cards, Narração e Cinemático separam os destaques (narrador
// grande / personagens em cena) dos demais; o Igualitário faz uma grade só.

import type { ModoGravacao, PosicaoMapa } from "./gravacao";

export const LARGURA_TELA = 1920;
export const ALTURA_TELA = 1080;

const MARGEM = 40;
const ESPACO = 24;

// Altura ÷ largura do card. Retrato: imagem 3:4 + rodapé (nome e barras).
// Paisagem: o narrador grande, imagem 16:9 + faixa do nome.
const PROPORCAO_RETRATO = 1.7;
const PROPORCAO_PAISAGEM = 0.66;
const LARGURA_MAX_RETRATO = 440;
const LARGURA_MAX_PAISAGEM = 1100;

// Frações testadas pelo arranjo dos destaques (1 = altura toda, só no "U").
const FRACOES_DESTAQUE = [0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 1];
// Quantas vezes o destaque é mais largo que os demais, no mínimo, pra contar
// como destaque: o narrador em paisagem e os personagens em cena (retrato).
const PROPORCAO_NARRADOR_DEMAIS = 3;
const PROPORCAO_EM_CENA_DEMAIS = 1.5;
// Card do narrador com o mapa como foto: mapa 16:9 + faixa do nome (fração da
// largura, mesma conta do CSS .gv-card-com-mapa).
export const RODAPE_CARD_MAPA = 0.07;
const PROPORCAO_CARD_MAPA = 9 / 16 + RODAPE_CARD_MAPA;
// Fração da tela que o mapa ocupa (largura nas laterais, altura no centro).
const FRACAO_MAPA_LATERAL = 0.64;
const FRACAO_MAPA_CENTRO = 0.64;

export type Retangulo = { x: number; y: number; w: number; h: number };

export type FormatoCard = "retrato" | "paisagem";

export type CardNoLayout = Retangulo & {
  id: string;
  formato: FormatoCard;
  destaque: boolean;
  // Card do narrador com o mapa no lugar da foto (o miolo fica vazado).
  comMapa?: boolean;
};

export type EntradaLayout = {
  modo: ModoGravacao;
  // Ids na ordem dos cards. O do narrador (ID_NARRADOR) pode estar em qualquer posição.
  cards: string[];
  idNarrador: string;
  // Cinemático: personagens em cena.
  emCena: string[];
  // Foco: quem aparece (vazio = só o narrador).
  foco: string[];
  // Turno de criatura: o narrador vira o destaque do Cinemático.
  narradorDestacado: boolean;
  mapa: { ligado: boolean; posicao: PosicaoMapa; substituiNarrador: boolean } | null;
};

export type SaidaLayout = {
  cards: CardNoLayout[];
  mapa: Retangulo | null;
};

const TELA: Retangulo = {
  x: MARGEM,
  y: MARGEM,
  w: LARGURA_TELA - MARGEM * 2,
  h: ALTURA_TELA - MARGEM * 2,
};

export function calcularLayout(entrada: EntradaLayout): SaidaLayout {
  // Foco: só os escolhidos, arranjados como na Narração (o narrador, se
  // estiver entre eles, fica grande; sem ele, todos do mesmo tamanho).
  const e: EntradaLayout = entrada.modo === "foco"
    ? {
      ...entrada,
      modo: "narracao",
      cards: entrada.foco.length > 0
        ? entrada.cards.filter((id) => entrada.foco.includes(id))
        : entrada.cards.filter((id) => id === entrada.idNarrador),
    }
    : entrada;
  if (!e.mapa?.ligado) return { mapa: null, cards: dispor(e, TELA) };

  // Mapa ligado: a tela se divide na área do mapa (lado ou em cima) e na dos cards.
  const posicao = e.mapa.posicao;
  let areaMapa: Retangulo;
  let regiao: Retangulo;
  if (posicao === "esquerda" || posicao === "direita") {
    const larguraMapa = TELA.w * FRACAO_MAPA_LATERAL;
    const resto = TELA.w - larguraMapa - ESPACO;
    const naEsquerda = posicao === "esquerda";
    areaMapa = { ...TELA, x: naEsquerda ? TELA.x : TELA.x + resto + ESPACO, w: larguraMapa };
    regiao = { ...TELA, x: naEsquerda ? TELA.x + larguraMapa + ESPACO : TELA.x, w: resto };
  } else {
    [areaMapa, regiao] = dividir(TELA, FRACAO_MAPA_CENTRO, "vertical");
  }

  // Mapa como foto do narrador: o card dele vai pra área do mapa, com o mapa
  // no lugar da imagem e o nome embaixo; os jogadores ficam na outra área.
  if (e.mapa.substituiNarrador && e.cards.includes(e.idNarrador)) {
    const card = encaixar(areaMapa, 1 / PROPORCAO_CARD_MAPA);
    const destaque = e.modo === "narracao" || (e.modo === "cinematico" && e.narradorDestacado);
    const jogadores = { ...e, cards: e.cards.filter((id) => id !== e.idNarrador), narradorDestacado: false };
    return {
      mapa: { x: card.x, y: card.y, w: card.w, h: (card.w * 9) / 16 },
      cards: [
        { ...card, id: e.idNarrador, formato: "paisagem" as const, destaque, comMapa: true },
        ...dispor(jogadores, regiao),
      ],
    };
  }

  return { mapa: encaixar(areaMapa, 16 / 9), cards: dispor(e, regiao) };
}

// Os cards dentro de uma região, conforme o modo (Foco já filtrado).
function dispor(e: EntradaLayout, regiao: Retangulo): CardNoLayout[] {
  const temNarrador = e.cards.includes(e.idNarrador);

  // Quem é destaque em cada modo.
  let destaques: string[] = [];
  let formatoDestaque: FormatoCard = "retrato";
  if (e.modo === "narracao" && temNarrador) {
    destaques = [e.idNarrador];
    formatoDestaque = "paisagem";
  } else if (e.modo === "cinematico") {
    destaques = e.narradorDestacado && temNarrador
      ? [e.idNarrador]
      : e.cards.filter((id) => e.emCena.includes(id));
  }

  if (destaques.length === 0) return grade(regiao, e.cards, "retrato", false);

  const demais = e.cards.filter((id) => !destaques.includes(id));
  if (demais.length === 0) return grade(regiao, destaques, formatoDestaque, true);

  return centralizar(regiao, melhorArranjo(regiao, destaques, formatoDestaque, demais));
}

// Testa vários jeitos de dividir a região entre destaques e demais e fica com
// o que deixa os cards maiores, sem o destaque perder a vez de ser o maior:
//   - destaques numa faixa (em cima) e os demais embaixo;
//   - destaques de um lado e os demais do outro;
//   - destaques no centro e os demais em volta (dos lados e embaixo, em "U").
// Cada um com várias frações da região pros destaques.
function melhorArranjo(
  regiao: Retangulo,
  destaques: string[],
  formatoDestaque: FormatoCard,
  demais: string[],
): CardNoLayout[] {
  // O destaque precisa ser pelo menos K vezes mais largo que os demais.
  const k = formatoDestaque === "paisagem" ? PROPORCAO_NARRADOR_DEMAIS : PROPORCAO_EM_CENA_DEMAIS;
  const melhor = { cards: grade(regiao, destaques, formatoDestaque, true), nota: -1 };

  const avaliar = (cards: CardNoLayout[]) => {
    const wDestaque = cards.find((c) => c.destaque)?.w ?? 0;
    const wDemais = cards.find((c) => !c.destaque)?.w ?? 0;
    if (wDestaque <= 0 || wDemais <= 0) return;
    // Os demais já vêm limitados a wDestaque/k: ganha o arranjo em que eles
    // ficam maiores; a área ocupada desempata.
    const area = cards.reduce((s, c) => s + c.w * c.h, 0) / (regiao.w * regiao.h);
    const nota = wDemais * (1 + 0.15 * area);
    if (nota > melhor.nota) Object.assign(melhor, { cards, nota });
  };

  for (const fracao of FRACOES_DESTAQUE) {
    for (const eixo of ["vertical", "horizontal"] as const) {
      const [a, b] = dividir(regiao, fracao, eixo);
      const cardsDestaque = grade(a, destaques, formatoDestaque, true);
      const limite = (cardsDestaque[0]?.w ?? 0) / k;
      avaliar([...cardsDestaque, ...grade(b, demais, "retrato", false, limite)]);
    }
    for (const cards of emU(regiao, fracao, destaques, formatoDestaque, demais, k)) avaliar(cards);
  }
  return melhor.cards;
}

// Destaques centralizados numa faixa de cima (fração da altura; 1 = altura
// toda) e os demais dos dois lados dela e embaixo. Devolve uma opção pra cada
// quantidade de cards nos lados; todos os demais com o mesmo tamanho.
function emU(
  regiao: Retangulo,
  fracao: number,
  destaques: string[],
  formatoDestaque: FormatoCard,
  demais: string[],
  k: number,
): CardNoLayout[][] {
  const faixa = { ...regiao, h: fracao >= 1 ? regiao.h : (regiao.h - ESPACO) * fracao };
  const cardsDestaque = grade(faixa, destaques, formatoDestaque, true);
  const x0 = Math.min(...cardsDestaque.map((c) => c.x));
  const x1 = Math.max(...cardsDestaque.map((c) => c.x + c.w));
  const esquerda = { ...faixa, w: x0 - ESPACO - regiao.x };
  const direita = { ...faixa, x: x1 + ESPACO, w: regiao.x + regiao.w - x1 - ESPACO };
  const baixo = fracao >= 1 ? null : { ...regiao, y: faixa.y + faixa.h + ESPACO, h: regiao.h - faixa.h - ESPACO };
  if (esquerda.w < 60 || direita.w < 60) return [];

  const opcoes: CardNoLayout[][] = [];
  const n = demais.length;
  for (let nosLados = baixo ? 0 : n; nosLados <= n; nosLados += 1) {
    // Ordem de leitura: metade da esquerda, os do meio embaixo, o resto à direita.
    const nEsq = Math.ceil(nosLados / 2);
    const nDir = nosLados - nEsq;
    const grupos: [Retangulo, string[]][] = [
      [esquerda, demais.slice(0, nEsq)],
      [baixo ?? esquerda, demais.slice(nEsq, n - nDir)],
      [direita, demais.slice(n - nDir)],
    ];
    const w = Math.min(
      (cardsDestaque[0]?.w ?? 0) / k,
      ...grupos.filter(([, ids]) => ids.length > 0).map(([r, ids]) => melhorGrade(r, ids.length, "retrato").w),
    );
    if (w <= 0) continue;
    opcoes.push([
      ...cardsDestaque,
      ...grupos.flatMap(([r, ids]) => grade(r, ids, "retrato", false, w)),
    ]);
  }
  return opcoes;
}

// Move o conjunto pro centro da região (sobra igual dos dois lados).
function centralizar(regiao: Retangulo, cards: CardNoLayout[]): CardNoLayout[] {
  if (cards.length === 0) return cards;
  const x0 = Math.min(...cards.map((c) => c.x));
  const y0 = Math.min(...cards.map((c) => c.y));
  const x1 = Math.max(...cards.map((c) => c.x + c.w));
  const y1 = Math.max(...cards.map((c) => c.y + c.h));
  const dx = regiao.x + (regiao.w - (x1 - x0)) / 2 - x0;
  const dy = regiao.y + (regiao.h - (y1 - y0)) / 2 - y0;
  return cards.map((c) => ({ ...c, x: c.x + dx, y: c.y + dy }));
}

// Corta a região em duas, com o espaço entre elas. `fracao` é da primeira.
function dividir(r: Retangulo, fracao: number, eixo: "vertical" | "horizontal"): [Retangulo, Retangulo] {
  if (eixo === "vertical") {
    const h1 = (r.h - ESPACO) * fracao;
    return [
      { ...r, h: h1 },
      { ...r, y: r.y + h1 + ESPACO, h: r.h - h1 - ESPACO },
    ];
  }
  const w1 = (r.w - ESPACO) * fracao;
  return [
    { ...r, w: w1 },
    { ...r, x: r.x + w1 + ESPACO, w: r.w - w1 - ESPACO },
  ];
}

// Maior retângulo com a proporção (largura ÷ altura) que cabe, centralizado.
function encaixar(r: Retangulo, proporcao: number): Retangulo {
  const w = Math.min(r.w, r.h * proporcao);
  const h = w / proporcao;
  return { x: r.x + (r.w - w) / 2, y: r.y + (r.h - h) / 2, w, h };
}

// Testa de 1 linha até uma por card e fica com a que deixa o card mais largo.
function melhorGrade(r: Retangulo, n: number, formato: FormatoCard, larguraMax = Infinity) {
  const proporcao = formato === "retrato" ? PROPORCAO_RETRATO : PROPORCAO_PAISAGEM;
  const limite = Math.min(larguraMax, formato === "retrato" ? LARGURA_MAX_RETRATO : LARGURA_MAX_PAISAGEM);
  let melhor = { linhas: 1, colunas: n, w: 0 };
  for (let linhas = 1; linhas <= n; linhas += 1) {
    const colunas = Math.ceil(n / linhas);
    const w = Math.min(
      (r.w - ESPACO * (colunas - 1)) / colunas,
      (r.h - ESPACO * (linhas - 1)) / linhas / proporcao,
      limite,
    );
    if (w > melhor.w) melhor = { linhas, colunas, w };
  }
  return { ...melhor, proporcao };
}

// Grade com o maior card possível (até `larguraMax`), linhas centralizadas.
function grade(
  r: Retangulo,
  ids: string[],
  formato: FormatoCard,
  destaque: boolean,
  larguraMax = Infinity,
): CardNoLayout[] {
  const n = ids.length;
  if (n === 0) return [];
  const { linhas, colunas, w, proporcao } = melhorGrade(r, n, formato, larguraMax);
  const h = w * proporcao;
  const alturaTotal = linhas * h + (linhas - 1) * ESPACO;
  const y0 = r.y + (r.h - alturaTotal) / 2;

  return ids.map((id, i) => {
    const linha = Math.floor(i / colunas);
    const naLinha = linha === linhas - 1 ? n - linha * colunas : colunas;
    const larguraLinha = naLinha * w + (naLinha - 1) * ESPACO;
    const x0 = r.x + (r.w - larguraLinha) / 2;
    return {
      id,
      formato,
      destaque,
      x: x0 + (i % colunas) * (w + ESPACO),
      y: y0 + linha * (h + ESPACO),
      w,
      h,
    };
  });
}
