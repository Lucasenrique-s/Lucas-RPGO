"use client";

import { BaseEdge, EdgeLabelRenderer, useInternalNode, type EdgeProps, type InternalNode } from "@xyflow/react";
import { centroDe, pontoNaBorda, type Retangulo } from "@/lib/diario-quadro-geo";
import { CORES_LIGACAO, LIMITES_QUADRO, TRACOS_LIGACAO, type TracoLigacao } from "@/lib/diario-quadro-tipos";
import { useQuadro, type ArestaLigacao } from "./quadro-contexto";

const COR_VAR: Record<string, string> = {
  vermelho: "var(--danger)",
  azul: "var(--info)",
  verde: "var(--success)",
  cinza: "var(--text-sec)",
};
const NOME_COR: Record<string, string> = { vermelho: "Vermelho", azul: "Azul", verde: "Verde", cinza: "Cinza" };
const NOME_TRACO: Record<TracoLigacao, string> = { continuo: "Contínuo", tracejado: "Tracejado", pontilhado: "Pontilhado" };
const DASH: Record<TracoLigacao, string | undefined> = { continuo: undefined, tracejado: "11 8", pontilhado: "1 9" };

const retDe = (n: InternalNode): Retangulo => ({
  x: n.internals.positionAbsolute.x,
  y: n.internals.positionAbsolute.y,
  largura: n.measured.width ?? n.width ?? 0,
  altura: n.measured.height ?? n.height ?? 0,
});

// Barbante: curva suave entre as bordas dos dois cartões (sem alça fixa), com rótulo no meio,
// cor, traço e seta opcional. Selecionado, mostra a barra de edição.
export function BarbanteAresta({ id, source, target, selected, data }: EdgeProps<ArestaLigacao>) {
  const ctx = useQuadro();
  const de = useInternalNode(source);
  const para = useInternalNode(target);
  const l = data?.ligacao;

  if (!de || !para || !l) return null;
  const r1 = retDe(de);
  const r2 = retDe(para);
  const p1 = pontoNaBorda(r1, centroDe(r2));
  const p2 = pontoNaBorda(r2, centroDe(r1));

  // Ponto de controle ao lado do meio da reta: a curva "pende" como um barbante frouxo.
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dist = Math.hypot(dx, dy) || 1;
  const pende = Math.min(70, Math.max(14, dist * 0.12));
  const c = { x: (p1.x + p2.x) / 2 - (dy / dist) * pende, y: (p1.y + p2.y) / 2 + (dx / dist) * pende };
  const caminho = `M ${p1.x} ${p1.y} Q ${c.x} ${c.y} ${p2.x} ${p2.y}`;
  const meio = { x: 0.25 * p1.x + 0.5 * c.x + 0.25 * p2.x, y: 0.25 * p1.y + 0.5 * c.y + 0.25 * p2.y };

  // Seta na ponta, seguindo a direção da curva ali.
  const ax = p2.x - c.x;
  const ay = p2.y - c.y;
  const am = Math.hypot(ax, ay) || 1;
  const ux = ax / am;
  const uy = ay / am;
  const t = 13;
  const seta = `${p2.x},${p2.y} ${p2.x - ux * t - uy * t * 0.5},${p2.y - uy * t + ux * t * 0.5} ${p2.x - ux * t + uy * t * 0.5},${p2.y - uy * t - ux * t * 0.5}`;

  const cor = COR_VAR[l.cor] ?? COR_VAR.cinza;
  const dash = DASH[l.traco];

  function salvarRotulo(valor: string) {
    const novo = valor.trim();
    if (novo !== (l?.rotulo ?? "")) ctx.atualizarLigacao(id, { rotulo: novo });
  }

  return (
    <>
      <BaseEdge
        id={id}
        path={caminho}
        interactionWidth={22}
        style={{ stroke: cor, strokeWidth: selected ? 3.5 : 2.5, strokeDasharray: dash, strokeLinecap: "round", opacity: l.oculto ? 0.55 : 1 }}
      />
      {l.seta && <polygon points={seta} style={{ fill: cor, pointerEvents: "none" }} />}
      <EdgeLabelRenderer>
        {!selected && l.rotulo && (
          <button
            type="button"
            className="qa-rotulo nodrag nopan"
            style={{ transform: `translate(-50%, -50%) translate(${meio.x}px, ${meio.y}px)`, borderColor: cor }}
            onClick={() => ctx.selecionarLigacao(id)}
          >
            {l.rotulo}
          </button>
        )}
        {selected && (
          <div className="qa-barra nodrag nopan" style={{ transform: `translate(-50%, -100%) translate(${meio.x}px, ${meio.y - 12}px)` }}>
            {ctx.podeEditar ? (
              <>
                <input
                  className="qa-rotulo-campo"
                  key={l.rotulo}
                  defaultValue={l.rotulo}
                  maxLength={LIMITES_QUADRO.rotulo}
                  placeholder="Rótulo (ex.: conspira com)"
                  aria-label="Rótulo da ligação"
                  onBlur={(e) => salvarRotulo(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                />
                <span className="qa-grupo" role="group" aria-label="Cor">
                  {CORES_LIGACAO.map((k) => (
                    <button
                      key={k}
                      type="button"
                      className={`qa-cor${l.cor === k ? " qa-cor--on" : ""}`}
                      style={{ background: COR_VAR[k] }}
                      title={NOME_COR[k]}
                      aria-label={NOME_COR[k]}
                      aria-pressed={l.cor === k}
                      onClick={() => ctx.atualizarLigacao(id, { cor: k })}
                    />
                  ))}
                </span>
                <span className="qa-grupo" role="group" aria-label="Traço">
                  {TRACOS_LIGACAO.map((k) => (
                    <button
                      key={k}
                      type="button"
                      className={`qa-traco${l.traco === k ? " qa-traco--on" : ""}`}
                      title={NOME_TRACO[k]}
                      aria-label={NOME_TRACO[k]}
                      aria-pressed={l.traco === k}
                      onClick={() => ctx.atualizarLigacao(id, { traco: k })}
                    >
                      <svg width="26" height="8" viewBox="0 0 26 8" aria-hidden>
                        <line x1="2" y1="4" x2="24" y2="4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeDasharray={DASH[k] ? (k === "tracejado" ? "5 4" : "0.5 5") : undefined} />
                      </svg>
                    </button>
                  ))}
                </span>
                <button
                  type="button"
                  className={`qa-btn${l.seta ? " qa-btn--on" : ""}`}
                  title="Seta na ponta"
                  aria-label="Seta"
                  aria-pressed={l.seta}
                  onClick={() => ctx.atualizarLigacao(id, { seta: !l.seta })}
                >
                  <i className="fas fa-arrow-right-long" />
                </button>
                <button type="button" className="qa-btn qa-btn--perigo" title="Apagar ligação" aria-label="Apagar ligação" onClick={() => ctx.apagarLigacao(id)}>
                  <i className="fas fa-trash" />
                </button>
              </>
            ) : (
              <span className="qa-leitura">{l.rotulo || "Sem rótulo"}</span>
            )}
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  );
}
