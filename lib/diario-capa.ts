// Cor da capa do caderno do diário. Puro: roda no cliente e no servidor.

export const CAPA_PADRAO = "#1f2328";

// Paleta de partida (o seletor livre cobre o resto). Tons de capa de caderno de verdade.
export const CAPAS: { cor: string; nome: string }[] = [
  { cor: "#1f2328", nome: "Preto" },
  { cor: "#7b1e2b", nome: "Vinho" },
  { cor: "#b3402a", nome: "Tijolo" },
  { cor: "#b8860b", nome: "Mostarda" },
  { cor: "#3d6b3a", nome: "Musgo" },
  { cor: "#0f5c5c", nome: "Petróleo" },
  { cor: "#1f3f6e", nome: "Azul-marinho" },
  { cor: "#4b2e83", nome: "Roxo" },
  { cor: "#8a5a3c", nome: "Couro" },
  { cor: "#c9a6a0", nome: "Rosé" },
  { cor: "#e8e2d0", nome: "Creme" },
];

const HEX = /^#[0-9a-f]{6}$/i;

export const corValida = (v: unknown): v is string => typeof v === "string" && HEX.test(v);

// Qualquer valor vindo do banco ou do cliente vira uma cor segura.
export const corDaCapa = (v: unknown): string => (corValida(v) ? v.toLowerCase() : CAPA_PADRAO);

type RGB = [number, number, number];

const paraRgb = (hex: string): RGB => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB;
const paraHex = (c: RGB) =>
  `#${c.map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0")).join("")}`;

// Mistura `a` com `b` (t = quanto de `b`, de 0 a 1).
const misturar = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// Luminância relativa (WCAG), de 0 a 1.
export function luminancia(hex: string): number {
  const [r, g, b] = paraRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// As variáveis CSS do caderno. A cor escolhida é a da capa; a moldura e a lombada
// são uma versão mais escura dela; o texto da capa troca de claro pra escuro conforme a cor.
export function estiloDaCapa(cor: string): Record<`--${string}`, string> {
  const base = corDaCapa(cor);
  const rgb = paraRgb(base);
  const clara = luminancia(base) > 0.4;
  return {
    "--capa": paraHex(misturar(rgb, [0, 0, 0], clara ? 0.42 : 0.3)),
    "--capa-2": base,
    "--capa-borda": paraHex(misturar(rgb, clara ? [0, 0, 0] : [255, 255, 255], clara ? 0.18 : 0.14)),
    "--capa-texto": clara ? "#22262b" : "#eef0f3",
  };
}
