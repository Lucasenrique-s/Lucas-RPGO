"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ViewportPortal, useStore } from "@xyflow/react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { corDaPessoa, iniciais, limitarTaxa } from "@/lib/diario-quadro-presenca";

// Tempo real do quadro, sem postgres_changes. O canal `diario-quadro-<id>` leva três coisas:
//   • "mudou" (vem do servidor, sem conteúdo): quem recebe pergunta ao servidor o que mudou;
//   • "cursor" e "arrasto" (entre navegadores, só posições, com limite de taxa);
//   • presença: quem está no quadro agora.
// Cada aba tem a própria `chave`, então duas abas da mesma pessoa também se veem.

export type PessoaPresente = { chave: string; userId: string };
export type ArrastoRemoto = { id: string; x: number; y: number }[];

type EventoAoVivo =
  | { t: "cursor"; chave: string; userId: string; x: number; y: number }
  | { t: "presenca"; pessoas: PessoaPresente[] };

// Cursores e presença não passam pelo estado do quadro: cada peça escuta aqui e se redesenha sozinha,
// senão cada movimento de mouse alheio refaria o canvas inteiro.
export function criarBarramento() {
  const ouvintes = new Set<(e: EventoAoVivo) => void>();
  return {
    ouvir(fn: (e: EventoAoVivo) => void) {
      ouvintes.add(fn);
      return () => {
        ouvintes.delete(fn);
      };
    },
    emitir(e: EventoAoVivo) {
      ouvintes.forEach((f) => f(e));
    },
  };
}
export type Barramento = ReturnType<typeof criarBarramento>;

const ehNumero = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function lerArrasto(v: unknown): ArrastoRemoto | null {
  if (!v || typeof v !== "object" || !Array.isArray((v as { itens?: unknown }).itens)) return null;
  const itens = (v as { itens: unknown[] }).itens
    .filter((i): i is { id: string; x: number; y: number } => !!i && typeof i === "object" && typeof (i as { id?: unknown }).id === "string" && ehNumero((i as { x?: unknown }).x) && ehNumero((i as { y?: unknown }).y))
    .slice(0, 200);
  return itens;
}

export function useCanalDoQuadro({
  quadroId,
  meuId,
  chave,
  barramento,
  aoMudar,
  aoArrasto,
}: {
  quadroId: string;
  meuId: string;
  chave: string;
  barramento: Barramento;
  aoMudar: () => void;
  aoArrasto: (itens: ArrastoRemoto) => void;
}) {
  const aoMudarRef = useRef(aoMudar);
  const aoArrastoRef = useRef(aoArrasto);
  useEffect(() => {
    aoMudarRef.current = aoMudar;
    aoArrastoRef.current = aoArrasto;
  });
  const enviarRef = useRef<{ cursor: (x: number, y: number) => void; arrasto: (itens: ArrastoRemoto) => void } | null>(null);

  // O nome do canal é fixo (todos precisam do mesmo tópico): a assinatura só nasce depois de um tick,
  // pro remonte do modo dev não deixar canal pendurado.
  useEffect(() => {
    const supabase = createClient();
    let canal: RealtimeChannel | null = null;
    let pronto = false;

    const enviar = (evento: string, payload: Record<string, unknown>) => {
      if (pronto && canal) void canal.send({ type: "broadcast", event: evento, payload });
    };
    const cursor = limitarTaxa((x: number, y: number) => enviar("cursor", { c: chave, u: meuId, x, y }), 60);
    const arrasto = limitarTaxa((itens: ArrastoRemoto) => enviar("arrasto", { c: chave, itens }), 70);
    enviarRef.current = { cursor, arrasto };

    const t = window.setTimeout(() => {
      canal = supabase
        .channel(`diario-quadro-${quadroId}`, { config: { broadcast: { self: false }, presence: { key: chave } } })
        .on("broadcast", { event: "mudou" }, () => aoMudarRef.current())
        .on("broadcast", { event: "cursor" }, ({ payload }) => {
          const p = payload as { c?: unknown; u?: unknown; x?: unknown; y?: unknown };
          if (typeof p?.c === "string" && typeof p.u === "string" && ehNumero(p.x) && ehNumero(p.y)) {
            barramento.emitir({ t: "cursor", chave: p.c, userId: p.u, x: p.x, y: p.y });
          }
        })
        .on("broadcast", { event: "arrasto" }, ({ payload }) => {
          const itens = lerArrasto(payload);
          if (itens && itens.length > 0) aoArrastoRef.current(itens);
        })
        .on("presence", { event: "sync" }, () => {
          const estado = canal?.presenceState() ?? {};
          const pessoas: PessoaPresente[] = Object.entries(estado).map(([k, metas]) => ({
            chave: k,
            userId: (metas[0] as { userId?: string } | undefined)?.userId ?? "",
          }));
          barramento.emitir({ t: "presenca", pessoas: pessoas.filter((p) => p.userId) });
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            pronto = true;
            void canal?.track({ userId: meuId });
          }
        });
    }, 0);

    return () => {
      window.clearTimeout(t);
      cursor.cancelar();
      arrasto.cancelar();
      enviarRef.current = null;
      pronto = false;
      if (canal) void supabase.removeChannel(canal);
    };
  }, [quadroId, meuId, chave, barramento]);

  const enviarCursor = useCallback((x: number, y: number) => enviarRef.current?.cursor(x, y), []);
  const enviarArrasto = useCallback((itens: ArrastoRemoto) => enviarRef.current?.arrasto(itens), []);
  return { enviarCursor, enviarArrasto };
}

/* ─── Cursores dos outros, no próprio canvas ─── */

const SILENCIO_MS = 6000;

export function Cursores({ barramento, autores }: { barramento: Barramento; autores: Record<string, string> }) {
  const [cursores, setCursores] = useState<Map<string, { userId: string; x: number; y: number; em: number }>>(new Map());
  const zoom = useStore((s) => s.transform[2]);

  useEffect(() => {
    const parar = barramento.ouvir((e) => {
      if (e.t === "cursor") {
        setCursores((m) => new Map(m).set(e.chave, { userId: e.userId, x: e.x, y: e.y, em: Date.now() }));
      } else {
        // Quem saiu do quadro leva o cursor junto.
        const presentes = new Set(e.pessoas.map((p) => p.chave));
        setCursores((m) => {
          const resto = new Map([...m].filter(([k]) => presentes.has(k)));
          return resto.size === m.size ? m : resto;
        });
      }
    });
    // Cursor parado há tempo some.
    const faxina = window.setInterval(() => {
      setCursores((m) => {
        const agora = Date.now();
        const resto = new Map([...m].filter(([, c]) => agora - c.em < SILENCIO_MS));
        return resto.size === m.size ? m : resto;
      });
    }, 1500);
    return () => {
      parar();
      window.clearInterval(faxina);
    };
  }, [barramento]);

  return (
    <ViewportPortal>
      {[...cursores].map(([chave, c]) => (
        <div key={chave} className="qc" data-cor={corDaPessoa(c.userId)} style={{ transform: `translate(${c.x}px, ${c.y}px) scale(${1 / zoom})` }}>
          <svg width="18" height="22" viewBox="0 0 18 22" aria-hidden>
            <path d="M2 2 L2 17 L6.2 13.2 L9 20 L11.6 18.9 L8.8 12.3 L14.5 12.3 Z" fill="var(--c, var(--text-sec))" stroke="var(--bg-card)" strokeWidth="1.4" strokeLinejoin="round" />
          </svg>
          <span className="qc-nome">{autores[c.userId] ?? "Jogador"}</span>
        </div>
      ))}
    </ViewportPortal>
  );
}

/* ─── Quem está no quadro ─── */

export function Presenca({ barramento, chave, meuId, autores }: { barramento: Barramento; chave: string; meuId: string; autores: Record<string, string> }) {
  const [pessoas, setPessoas] = useState<PessoaPresente[]>([]);
  useEffect(
    () =>
      barramento.ouvir((e) => {
        if (e.t === "presenca") setPessoas(e.pessoas.filter((p) => p.chave !== chave));
      }),
    [barramento, chave],
  );
  if (pessoas.length === 0) return null;
  const mostrar = pessoas.slice(0, 5);
  return (
    <div className="qp" role="list" aria-label="Quem está no quadro">
      {mostrar.map((p) => {
        const nome = autores[p.userId] ?? "Jogador";
        return (
          <span key={p.chave} role="listitem" className="qp-avatar" data-cor={corDaPessoa(p.userId)} title={p.userId === meuId ? `${nome} (outra aba sua)` : nome}>
            {iniciais(nome)}
          </span>
        );
      })}
      {pessoas.length > mostrar.length && <span className="qp-mais">+{pessoas.length - mostrar.length}</span>}
    </div>
  );
}
