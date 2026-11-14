"use client";

import { useCallback, useEffect, useState } from "react";
import { exigir } from "@/lib/acoes";
import { extrairAtalhos } from "@/lib/diario-tipos";
import type { ContextoRico, OpcaoRef } from "@/components/descricao-rica/atomos";
import { EditorComImagem, avisar } from "./diario-partes";
import { criarNotaDiario } from "./actions";

// Caixa de anotação rápida: Ctrl+J (ou N, fora de um campo de texto) abre; Ctrl+Enter
// salva na sessão ao vivo. O rascunho fica no aparelho até salvar.
const chaveRascunho = (mesaId: string) => `rpgo:diario:rascunho:${mesaId}`;

function lerRascunho(mesaId: string): string {
  try {
    return window.localStorage.getItem(chaveRascunho(mesaId)) ?? "";
  } catch {
    return "";
  }
}

function gravarRascunho(mesaId: string, texto: string) {
  try {
    if (texto.trim()) window.localStorage.setItem(chaveRascunho(mesaId), texto);
    else window.localStorage.removeItem(chaveRascunho(mesaId));
  } catch {
    /* sem storage: só não guarda o rascunho */
  }
}

function emCampoDeTexto(alvo: EventTarget | null): boolean {
  const el = alvo as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

export function CapturaRapida({
  mesaId,
  meuId,
  refs,
  contexto,
  rotuloSessao,
  aberta,
  atalho = true,
  teclaN = false,
  aoAbrir,
  aoFechar,
  aoSalvou,
}: {
  mesaId: string;
  meuId: string;
  refs: OpcaoRef[];
  contexto: ContextoRico;
  // Onde a anotação vai cair: a sessão ao vivo ou "Entre sessões".
  rotuloSessao: string;
  aberta: boolean;
  // Liga o atalho global (Ctrl+J; N fora de campo de texto). Desligue na tela que já tem um.
  atalho?: boolean;
  // Liga também a tecla N sozinha (só na tela do diário: nas outras ela pode ter outro uso).
  teclaN?: boolean;
  aoAbrir: () => void;
  aoFechar: () => void;
  // Depois de salvar (a tela recarrega o que mostra).
  aoSalvou?: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);

  // Atalho global.
  useEffect(() => {
    if (!atalho) return;
    const tecla = (e: KeyboardEvent) => {
      const ctrlJ = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "j";
      const soN = teclaN && e.key.toLowerCase() === "n" && !e.ctrlKey && !e.metaKey && !e.altKey && !emCampoDeTexto(e.target);
      if (!ctrlJ && !soN) return;
      e.preventDefault();
      aoAbrir();
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [atalho, teclaN, aoAbrir]);

  // Ao abrir, retoma o rascunho (lido fora do corpo do efeito).
  useEffect(() => {
    if (!aberta) return;
    const t = window.setTimeout(() => setTexto(lerRascunho(mesaId)), 0);
    return () => window.clearTimeout(t);
  }, [aberta, mesaId]);

  const mudar = useCallback(
    (v: string) => {
      setTexto(v);
      gravarRascunho(mesaId, v);
    },
    [mesaId],
  );

  const salvar = useCallback(async () => {
    const a = extrairAtalhos(texto);
    if (!a.corpo || salvando) return;
    setSalvando(true);
    try {
      exigir(await criarNotaDiario(mesaId, { corpo: a.corpo, tags: a.tags, importante: a.importante }));
      gravarRascunho(mesaId, "");
      setTexto("");
      aoFechar();
      aoSalvou?.();
    } catch (e) {
      avisar(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setSalvando(false);
    }
  }, [texto, salvando, mesaId, aoFechar, aoSalvou]);

  if (!aberta) return null;
  return (
    <>
      <div className="diario-fundo" onClick={aoFechar} aria-hidden />
      <div
        className="diario-captura"
        role="dialog"
        aria-label="Anotação rápida"
        onKeyDown={(e) => {
          if (e.key === "Escape") aoFechar();
          if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            e.preventDefault();
            void salvar();
          }
        }}
      >
        <div className="diario-captura-topo">
          <b>Anotação rápida</b>
          <span>
            {rotuloSessao} · {new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
        <EditorComImagem
          mesaId={mesaId}
          meuId={meuId}
          valor={texto}
          onChange={mudar}
          refs={refs}
          contexto={contexto}
          placeholder="Digite e use Ctrl+Enter para salvar. @ menciona, #tag, “! ” no começo marca importante."
        />
        <div className="diario-form-acoes">
          <button type="button" className="diario-btn" onClick={aoFechar} disabled={salvando}>
            Fechar (o rascunho fica)
          </button>
          <button type="button" className="diario-btn diario-btn--primario" onClick={() => void salvar()} disabled={salvando || !texto.trim()}>
            {salvando ? "Salvando..." : "Salvar · Ctrl+Enter"}
          </button>
        </div>
      </div>
    </>
  );
}
