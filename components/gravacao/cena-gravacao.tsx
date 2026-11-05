"use client";

import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import type { MostrarGravacao } from "@/lib/gravacao";
import { ALTURA_TELA, LARGURA_TELA, type CardNoLayout, type Retangulo, type SaidaLayout } from "@/lib/layout-gravacao";
import { CardGravacao, type DadosCardGravacao } from "./card-gravacao";
import "./gravacao.css";

// Mesma duração da transição em gravacao.css (--gv-transicao).
const DURACAO_SAIDA = 450;
// Até aqui (px da tela) o arrasto ainda é um clique.
const LIMIAR_ARRASTO = 4;

type CardVisivel = { card: CardNoLayout; dados: DadosCardGravacao };

type Arrasto = {
  id: string;
  pointerId: number;
  inicio: { x: number; y: number };
  // Px da tela por px do palco (a prévia é encolhida).
  escala: number;
  dx: number;
  dy: number;
  alvo: string | null;
};

type Props = {
  layout: SaidaLayout;
  dados: Record<string, DadosCardGravacao>;
  mostrar: (id: string) => MostrarGravacao;
  // Por baixo de tudo, no retângulo do mapa. No OBS fica vazio (o mapa é a
  // fonte de baixo); a prévia põe um mapa de mentira pra enxergar o encaixe.
  fundoMapa?: ReactNode;
  // Só na prévia: arrastar um card e soltar em cima de outro troca a ordem.
  aoSoltarSobre?: (id: string, alvoId: string) => void;
  // Card de quem é a vez no combate (ganha a marca em qualquer modo).
  vez?: string | null;
};

/**
 * Palco 1920×1080 de fundo transparente. Quem usa escala com CSS (prévia) ou
 * deixa no tamanho real (overlay). Os cards deslizam e mudam de tamanho a cada
 * layout novo; quem sai do layout some no último lugar em que estava.
 */
export function CenaGravacao({ layout, dados, mostrar, fundoMapa, aoSoltarSobre, vez = null }: Props) {
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

  const palco = useRef<HTMLDivElement>(null);
  const [arrasto, setArrasto] = useState<Arrasto | null>(null);

  function comecar(e: PointerEvent<HTMLDivElement>, id: string) {
    if (!aoSoltarSobre || e.button !== 0 || !palco.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const escala = palco.current.getBoundingClientRect().width / LARGURA_TELA || 1;
    setArrasto({ id, pointerId: e.pointerId, inicio: { x: e.clientX, y: e.clientY }, escala, dx: 0, dy: 0, alvo: null });
  }

  function mover(e: PointerEvent<HTMLDivElement>) {
    if (!arrasto || e.pointerId !== arrasto.pointerId) return;
    const dx = (e.clientX - arrasto.inicio.x) / arrasto.escala;
    const dy = (e.clientY - arrasto.inicio.y) / arrasto.escala;
    // Alvo: o card que está debaixo do centro do arrastado.
    const meu = visiveis.find((v) => v.card.id === arrasto.id)?.card;
    const cx = meu ? meu.x + meu.w / 2 + dx : 0;
    const cy = meu ? meu.y + meu.h / 2 + dy : 0;
    const alvo = visiveis.find(
      ({ card: c }) => c.id !== arrasto.id && cx >= c.x && cx <= c.x + c.w && cy >= c.y && cy <= c.y + c.h,
    )?.card.id ?? null;
    setArrasto({ ...arrasto, dx, dy, alvo });
  }

  function soltar(e: PointerEvent<HTMLDivElement>) {
    if (!arrasto || e.pointerId !== arrasto.pointerId) return;
    if (arrasto.alvo) aoSoltarSobre?.(arrasto.id, arrasto.alvo);
    setArrasto(null);
  }

  const movido = !!arrasto && Math.hypot(arrasto.dx, arrasto.dy) * arrasto.escala > LIMIAR_ARRASTO;

  return (
    <div
      ref={palco}
      className={`gv-cena dark-mode${aoSoltarSobre ? " gv-cena-arrastavel" : ""}`}
      style={{ width: LARGURA_TELA, height: ALTURA_TELA }}
    >
      {layout.mapa && (
        <>
          {fundoMapa && (
            <div className="gv-mapa-fundo" style={posicao(layout.mapa)}>
              {fundoMapa}
            </div>
          )}
          {/* Mapa como foto do narrador: a moldura é o próprio card. */}
          {!layout.cards.some((c) => c.comMapa) && <div className="gv-mapa-moldura" style={posicao(layout.mapa)} />}
        </>
      )}

      {saindo.map(({ card, dados: d }) => (
        <div key={`saindo-${card.id}`} className="gv-slot gv-slot-saindo" style={posicao(card)}>
          <CardGravacao
            dados={d}
            mostrar={mostrar(card.id)}
            formato={card.formato}
            destaque={card.destaque}
            comMapa={card.comMapa}
          />
        </div>
      ))}

      {visiveis.map(({ card, dados: d }) => {
        const arrastando = movido && arrasto?.id === card.id;
        const classe = `gv-slot${arrastando ? " gv-slot-arrastando" : ""}${movido && arrasto?.alvo === card.id ? " gv-slot-alvo" : ""}`;
        const estilo = arrastando
          ? { ...posicao(card), transform: `translate(${card.x + arrasto.dx}px, ${card.y + arrasto.dy}px)` }
          : posicao(card);
        return (
          <div
            key={card.id}
            className={classe}
            style={estilo}
            onPointerDown={aoSoltarSobre ? (e) => comecar(e, card.id) : undefined}
            onPointerMove={aoSoltarSobre ? mover : undefined}
            onPointerUp={aoSoltarSobre ? soltar : undefined}
            onPointerCancel={aoSoltarSobre ? () => setArrasto(null) : undefined}
          >
            <CardGravacao
              dados={d}
              mostrar={mostrar(card.id)}
              formato={card.formato}
              destaque={card.destaque}
              vez={card.id === vez}
              comMapa={card.comMapa}
            />
          </div>
        );
      })}
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
