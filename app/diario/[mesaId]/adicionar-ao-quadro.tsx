"use client";

import { useState } from "react";
import Link from "next/link";
import { exigir } from "@/lib/acoes";
import type { QuadroResumoDTO } from "@/lib/diario-quadro-tipos";
import { adicionarPaginaAoQuadro } from "./quadro-importar";
import { avisar } from "./diario-partes";

// "Adicionar ao quadro", na página da wiki: pendura um cartão da página no quadro escolhido (o da mesa vem primeiro).
export function AdicionarAoQuadro({ mesaId, fichaId, quadros }: { mesaId: string; fichaId: string; quadros: QuadroResumoDTO[] }) {
  const [aberto, setAberto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [feito, setFeito] = useState<QuadroResumoDTO | null>(null);

  // Só onde a pessoa pode editar; o quadro da mesa primeiro.
  const destinos = quadros.filter((q) => q.permissoes.editar).sort((a, b) => Number(b.papel === "mesa") - Number(a.papel === "mesa"));
  if (destinos.length === 0) return null;

  async function adicionar(q: QuadroResumoDTO) {
    setOcupado(true);
    try {
      exigir(await adicionarPaginaAoQuadro(mesaId, q.id, fichaId));
      setFeito(q);
      setAberto(false);
    } catch (e) {
      avisar(e instanceof Error ? e.message : "Não foi possível adicionar ao quadro.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <span className="aq">
      <button type="button" aria-expanded={aberto} onClick={() => setAberto((v) => !v)} disabled={ocupado}>
        <i className="fas fa-diagram-project" /> Adicionar ao quadro
      </button>
      {aberto && (
        <span className="aq-menu" role="menu">
          {destinos.map((q) => (
            <button key={q.id} type="button" role="menuitem" onClick={() => void adicionar(q)}>
              <i className={`fas ${q.papel === "mesa" ? "fa-earth-americas" : "fa-lock"}`} /> {q.nome}
            </button>
          ))}
        </span>
      )}
      {feito && (
        <span className="aq-feito" role="status">
          <i className="fas fa-check" /> Adicionada a “{feito.nome}”.{" "}
          <Link href={`/diario/${mesaId}/quadros/${feito.id}`}>Abrir</Link>
        </span>
      )}
    </span>
  );
}
