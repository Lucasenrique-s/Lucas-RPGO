"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { MostrarGravacao } from "@/lib/gravacao";
import { ALTURA_TELA, LARGURA_TELA, type CardNoLayout, type Retangulo, type SaidaLayout } from "@/lib/layout-gravacao";
import { CardGravacao, type DadosCardGravacao } from "./card-gravacao";
import "./gravacao.css";

// Mesma duração da transição em gravacao.css (--gv-transicao).
const DURACAO_SAIDA = 450;

type CardVisivel = { card: CardNoLayout; dados: DadosCardGravacao };

type Props = {
  layout: SaidaLayout;
  dados: Record<string, DadosCardGravacao>;
  mostrar: (id: string) => MostrarGravacao;
  // Por baixo de tudo, no retângulo do mapa. No OBS fica vazio (o mapa é a
  // fonte de baixo); a prévia põe um mapa de mentira pra enxergar o encaixe.
  fundoMapa?: ReactNode;
};

/**
 * Palco 1920×1080 de fundo transparente. Quem usa escala com CSS (prévia) ou
 * deixa no tamanho real (overlay). Os cards deslizam e mudam de tamanho a cada
 * layout novo; quem sai do layout some no último lugar em que estava.
 */
export function CenaGravacao({ layout, dados, mostrar, fundoMapa }: Props) {
  const visiveis: CardVisivel[] = layout.cards.flatMap((card) =>
    dados[card.id] ? [{ card, dados: dados[card.id] }] : [],
  );

  // Estado derivado ajustado no render (padrão do React): quando os cards ou
  // os retângulos mudam, quem sumiu vira "saindo" com o último lugar e dados.
  const assinatura = visiveis
    .map(({ card: c }) => `${c.id}:${Math.round(c.x)},${Math.round(c.y)},${Math.round(c.w)}`)
    .join("|");
  const [anterior, setAnterior] = useState({ assinatura, visiveis });
  const [saindo, setSaindo] = useState<CardVisivel[]>([]);
  if (anterior.assinatura !== assinatura) {
    const atuais = new Set(visiveis.map((v) => v.card.id));
    const sairam = anterior.visiveis.filter((v) => !atuais.has(v.card.id));
    setAnterior({ assinatura, visiveis });
    if (sairam.length > 0 || saindo.some((v) => atuais.has(v.card.id))) {
      setSaindo((s) => [...s.filter((v) => !atuais.has(v.card.id)), ...sairam]);
    }
  }

  useEffect(() => {
    if (saindo.length === 0) return;
    const t = setTimeout(() => setSaindo([]), DURACAO_SAIDA);
    return () => clearTimeout(t);
  }, [saindo]);

  return (
    <div className="gv-cena dark-mode" style={{ width: LARGURA_TELA, height: ALTURA_TELA }}>
      {layout.mapa && (
        <>
          {fundoMapa && (
            <div className="gv-mapa-fundo" style={posicao(layout.mapa)}>
              {fundoMapa}
            </div>
          )}
          <div className="gv-mapa-moldura" style={posicao(layout.mapa)} />
        </>
      )}

      {saindo.map(({ card, dados: d }) => (
        <div key={`saindo-${card.id}`} className="gv-slot gv-slot-saindo" style={posicao(card)}>
          <CardGravacao dados={d} mostrar={mostrar(card.id)} formato={card.formato} destaque={card.destaque} />
        </div>
      ))}

      {visiveis.map(({ card, dados: d }) => (
        <div key={card.id} className="gv-slot" style={posicao(card)}>
          <CardGravacao dados={d} mostrar={mostrar(card.id)} formato={card.formato} destaque={card.destaque} />
        </div>
      ))}
    </div>
  );
}

function posicao(r: Retangulo) {
  return {
    transform: `translate(${r.x}px, ${r.y}px)`,
    width: r.w,
    height: r.h,
  };
}
