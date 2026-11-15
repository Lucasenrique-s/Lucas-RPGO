// Geometria e entrada de dados do canvas dos quadros. Puro (sem React, sem banco).

import { LIMITES_QUADRO as L, limitar } from "./diario-quadro-tipos.ts";

export type Retangulo = { x: number; y: number; largura: number; altura: number };
export type Ponto = { x: number; y: number };

export const centroDe = (r: Retangulo): Ponto => ({ x: r.x + r.largura / 2, y: r.y + r.altura / 2 });

// Ponto da borda do retângulo `r` no caminho do centro dele até `alvo` (barbante "flutuante":
// a ponta sai do lado que olha pro outro cartão, sem alça fixa).
export function pontoNaBorda(r: Retangulo, alvo: Ponto): Ponto {
  const c = centroDe(r);
  const dx = alvo.x - c.x;
  const dy = alvo.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const meiaL = r.largura / 2;
  const meiaA = r.altura / 2;
  // Quanto do vetor cabe antes de bater na borda: o menor entre os dois eixos.
  const t = Math.min(dx === 0 ? Infinity : meiaL / Math.abs(dx), dy === 0 ? Infinity : meiaA / Math.abs(dy));
  return { x: c.x + dx * t, y: c.y + dy * t };
}

// Cartão dentro da moldura: o centro dele cai na moldura (mover a moldura leva junto o que está dentro).
export function dentroDaMoldura(moldura: Retangulo, cartao: Retangulo): boolean {
  const c = centroDe(cartao);
  return c.x >= moldura.x && c.x <= moldura.x + moldura.largura && c.y >= moldura.y && c.y <= moldura.y + moldura.altura;
}

// Geometria vinda do cliente: números finitos, dentro dos limites.
export function limitarGeometria(g: Partial<Retangulo>): Partial<Retangulo> {
  const out: Partial<Retangulo> = {};
  if (g.x !== undefined) out.x = limitar(g.x, -L.coordenada, L.coordenada);
  if (g.y !== undefined) out.y = limitar(g.y, -L.coordenada, L.coordenada);
  if (g.largura !== undefined) out.largura = limitar(g.largura, L.larguraMin, L.larguraMax);
  if (g.altura !== undefined) out.altura = limitar(g.altura, L.alturaMin, L.alturaMax);
  return out;
}

// Texto colado que é um endereço (uma linha só, http ou https).
export function extrairUrl(texto: string): string | null {
  const t = texto.trim();
  if (!t || /\s/.test(t) || !/^https?:\/\//i.test(t)) return null;
  try {
    return new URL(t).toString();
  } catch {
    return null;
  }
}

// Endereço que aponta direto pra uma imagem (pelo final do caminho).
export function pareceImagem(url: string): boolean {
  try {
    return /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

// Aperta a imagem na caixa máxima mantendo a proporção.
export function ajustarImagem(largura: number, altura: number, max = 360): { largura: number; altura: number } {
  if (!(largura > 0) || !(altura > 0)) return { largura: max, altura: Math.round(max * 0.75) };
  const k = Math.min(1, max / Math.max(largura, altura));
  return { largura: Math.round(largura * k), altura: Math.round(altura * k) };
}

const bate = (a: Retangulo, b: Retangulo, folga: number) =>
  a.x < b.x + b.largura + folga && a.x + a.largura + folga > b.x && a.y < b.y + b.altura + folga && a.y + a.altura + folga > b.y;

// Primeiro lugar sem cartão por perto, em anéis ao redor de `r` (cartão novo não nasce em cima de outro).
export function acharLugarLivre(r: Retangulo, ocupados: Retangulo[], folga = 24, aneis = 6): Retangulo {
  const passoX = r.largura + folga;
  const passoY = r.altura + folga;
  for (let anel = 0; anel <= aneis; anel++) {
    const candidatos: { dx: number; dy: number }[] = [];
    for (let dy = -anel; dy <= anel; dy++) {
      for (let dx = -anel; dx <= anel; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) === anel) candidatos.push({ dx, dy });
      }
    }
    candidatos.sort((a, b) => Math.hypot(a.dx, a.dy) - Math.hypot(b.dx, b.dy));
    for (const c of candidatos) {
      const t = { ...r, x: r.x + c.dx * passoX, y: r.y + c.dy * passoY };
      if (!ocupados.some((o) => bate(t, o, folga))) return t;
    }
  }
  return r;
}
