// Presença e cursores dos quadros: coisas puras (cor da pessoa, iniciais, limite de taxa).

import { CORES_CARTAO, type CorCartao } from "./diario-quadro-tipos.ts";

// Cada pessoa tem sempre a mesma cor no quadro (cursor, avatar e, depois, "cor por autor").
// O cinza fica de fora: é a cor de "sem dono".
const CORES_PESSOA = CORES_CARTAO.filter((c) => c !== "cinza");

export function corDaPessoa(userId: string): CorCartao {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return CORES_PESSOA[h % CORES_PESSOA.length];
}

// Duas letras pro avatar: "Zoro Teste" -> "ZT", "Narrador" -> "NA".
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

// Chama `fn` no máximo uma vez a cada `ms`; o último valor sempre chega (no fim da janela).
// `cancelar` descarta o que estava esperando.
export function limitarTaxa<A extends unknown[]>(fn: (...a: A) => void, ms: number) {
  let ultimo = 0;
  let espera: ReturnType<typeof setTimeout> | null = null;
  let pendente: A | null = null;

  function enviar(a: A) {
    ultimo = Date.now();
    fn(...a);
  }
  const limitada = (...a: A) => {
    const agora = Date.now();
    if (espera === null && agora - ultimo >= ms) {
      enviar(a);
      return;
    }
    pendente = a;
    if (espera === null) {
      espera = setTimeout(() => {
        espera = null;
        if (pendente) {
          const p = pendente;
          pendente = null;
          enviar(p);
        }
      }, Math.max(0, ms - (agora - ultimo)));
    }
  };
  limitada.cancelar = () => {
    if (espera !== null) clearTimeout(espera);
    espera = null;
    pendente = null;
  };
  return limitada;
}
