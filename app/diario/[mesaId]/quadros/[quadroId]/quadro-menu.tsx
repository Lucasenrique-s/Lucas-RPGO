"use client";

import { useEffect, useState } from "react";

export type ItemMenu = { rotulo: string; icone: string; perigo?: boolean; aoEscolher: () => void };

// Menu do toque longo (celular): aparece onde o dedo ficou, com o que dá pra fazer ali.
// `monta` roda uma vez, quando o menu abre: o que aparece é o que havia sob o dedo naquela hora.
export function MenuContexto({ x, y, monta, aoFechar }: { x: number; y: number; monta: () => { titulo: string; itens: ItemMenu[] }; aoFechar: () => void }) {
  const [{ titulo, itens }] = useState(monta);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && aoFechar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [aoFechar]);

  // Dentro da tela: o menu abre pra cima/esquerda se o toque foi perto da borda.
  const largura = 230;
  const altura = 44 * itens.length + 38;
  const esquerda = Math.max(8, Math.min(x - largura / 2, window.innerWidth - largura - 8));
  const topo = Math.max(8, Math.min(y + 8, window.innerHeight - altura - 8));

  return (
    <div className="qm-fundo" onPointerDown={(e) => e.target === e.currentTarget && aoFechar()}>
      <div className="qm" role="menu" aria-label={titulo} style={{ left: esquerda, top: topo, width: largura }}>
        <div className="qm-titulo">{titulo}</div>
        {itens.map((i) => (
          <button
            key={i.rotulo}
            type="button"
            role="menuitem"
            className={`qm-item${i.perigo ? " qm-item--perigo" : ""}`}
            onClick={() => {
              aoFechar();
              i.aoEscolher();
            }}
          >
            <i className={`fas ${i.icone}`} aria-hidden /> {i.rotulo}
          </button>
        ))}
      </div>
    </div>
  );
}
