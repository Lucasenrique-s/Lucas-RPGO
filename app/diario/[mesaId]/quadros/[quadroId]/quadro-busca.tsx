"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { TIPOS_FICHA } from "@/lib/diario-tipos";
import type { RefPaginaDTO } from "@/lib/diario-quadro-tipos";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// `@` com o quadro em foco: busca uma página e Enter pendura o cartão dela no centro.
export function BuscaPagina({
  paginas,
  aoEscolher,
  aoFechar,
}: {
  paginas: RefPaginaDTO[];
  aoEscolher: (id: string) => void;
  aoFechar: () => void;
}) {
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState(0);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => campo.current?.focus(), []);

  const lista = useMemo(() => {
    const q = norm(busca.trim());
    return paginas.filter((p) => !q || norm(p.nome).includes(q)).slice(0, 8);
  }, [paginas, busca]);

  const marcada = Math.min(sel, Math.max(0, lista.length - 1));

  return (
    <div className="qb" role="dialog" aria-label="Buscar página" onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}>
      <div className="qb-caixa">
        <div className="qb-campo">
          <i className="fas fa-at" aria-hidden />
          <input
            ref={campo}
            value={busca}
            placeholder="Nome da página…"
            aria-label="Nome da página"
            onChange={(e) => {
              setBusca(e.target.value);
              setSel(0);
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Escape") aoFechar();
              else if (e.key === "ArrowDown") {
                e.preventDefault();
                setSel(Math.min(lista.length - 1, marcada + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSel(Math.max(0, marcada - 1));
              } else if (e.key === "Enter" && lista[marcada]) {
                e.preventDefault();
                aoEscolher(lista[marcada].id);
              }
            }}
          />
        </div>
        <ul className="qb-lista" role="listbox">
          {lista.map((p, i) => {
            const t = TIPOS_FICHA.find((x) => x.id === p.tipo);
            return (
              <li key={p.id} role="option" aria-selected={i === marcada}>
                <button type="button" className={`qb-item${i === marcada ? " qb-item--on" : ""}`} onMouseEnter={() => setSel(i)} onClick={() => aoEscolher(p.id)}>
                  <i className={`fas ${t?.icone ?? "fa-file"}`} style={{ color: t?.cor }} aria-hidden />
                  <span>{p.nome}</span>
                  <small>{t?.nome}</small>
                </button>
              </li>
            );
          })}
          {lista.length === 0 && <li className="qb-vazio">Nenhuma página com esse nome.</li>}
        </ul>
        <p className="qb-dica">↑ ↓ para escolher · Enter pendura no quadro · Esc fecha</p>
      </div>
    </div>
  );
}
