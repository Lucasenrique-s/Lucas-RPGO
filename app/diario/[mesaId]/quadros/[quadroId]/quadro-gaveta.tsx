"use client";

import { useMemo, useState } from "react";
import { TIPOS_FICHA, dataDaSessao, rotuloSessao } from "@/lib/diario-tipos";
import type { RefNotaDTO, RefPaginaDTO, RefSessaoDTO, TipoCartao } from "@/lib/diario-quadro-tipos";

export type AbaGaveta = "paginas" | "notas" | "sessoes";

// O que se arrasta da gaveta (ou clica) vira um cartão de referência.
export type ItemArrastado = { tipo: Extract<TipoCartao, "pagina" | "nota" | "sessao">; refId: string };
export const TIPO_ARRASTE = "application/x-rpgo-quadro";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Gaveta recolhível à esquerda: páginas, anotações e sessões, pra arrastar (ou clicar) pro quadro.
export function Gaveta({
  aberta,
  aba,
  aoMudarAba,
  aoFechar,
  paginas,
  notas,
  sessoes,
  meuId,
  podeEditar,
  aoUsar,
}: {
  aberta: boolean;
  aba: AbaGaveta;
  aoMudarAba: (a: AbaGaveta) => void;
  aoFechar: () => void;
  paginas: RefPaginaDTO[];
  notas: RefNotaDTO[];
  sessoes: RefSessaoDTO[];
  meuId: string;
  podeEditar: boolean;
  aoUsar: (item: ItemArrastado) => void;
}) {
  const [busca, setBusca] = useState("");
  const q = norm(busca.trim());

  const listaPaginas = useMemo(
    () => paginas.filter((p) => !q || norm(p.nome).includes(q)),
    [paginas, q],
  );
  const listaNotas = useMemo(
    () => notas.filter((n) => !q || norm(`${n.titulo ?? ""} ${n.previa}`).includes(q)),
    [notas, q],
  );
  const listaSessoes = useMemo(() => sessoes.filter((s) => !q || norm(rotuloSessao(s)).includes(q)), [sessoes, q]);

  function arrastavel(item: ItemArrastado) {
    return {
      draggable: podeEditar,
      onDragStart: (e: React.DragEvent) => {
        e.dataTransfer.setData(TIPO_ARRASTE, JSON.stringify(item));
        e.dataTransfer.effectAllowed = "copy";
      },
      onClick: () => podeEditar && aoUsar(item),
    };
  }

  return (
    <aside className={`qg${aberta ? " qg--aberta" : ""}`} aria-label="Gaveta de páginas, anotações e sessões" aria-hidden={!aberta}>
      <div className="qg-topo">
        <div className="qg-abas" role="tablist">
          {(
            [
              ["paginas", "Páginas", "fa-address-card"],
              ["notas", "Anotações", "fa-note-sticky"],
              ["sessoes", "Sessões", "fa-flag"],
            ] as const
          ).map(([id, nome, icone]) => (
            <button key={id} type="button" role="tab" aria-selected={aba === id} className="qg-aba" onClick={() => aoMudarAba(id)} tabIndex={aberta ? 0 : -1}>
              <i className={`fas ${icone}`} /> {nome}
            </button>
          ))}
        </div>
        <button type="button" className="qg-fechar" onClick={aoFechar} title="Recolher a gaveta" aria-label="Recolher a gaveta" tabIndex={aberta ? 0 : -1}>
          <i className="fas fa-chevron-left" />
        </button>
      </div>
      <input
        type="search"
        className="qg-busca"
        placeholder="Buscar…"
        aria-label="Buscar na gaveta"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        tabIndex={aberta ? 0 : -1}
      />
      {podeEditar && <p className="qg-dica">Arraste para o quadro ou clique para pregar no centro.</p>}
      <div className="qg-lista">
        {aba === "paginas" &&
          listaPaginas.map((p) => {
            const t = TIPOS_FICHA.find((x) => x.id === p.tipo);
            return (
              <div key={p.id} className="qg-item" tabIndex={aberta ? 0 : -1} {...arrastavel({ tipo: "pagina", refId: p.id })}>
                <span className="qg-item-icone" style={{ color: t?.cor }}>
                  {p.fotoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.fotoUrl} alt="" draggable={false} />
                  ) : (
                    <i className={`fas ${t?.icone ?? "fa-file"}`} />
                  )}
                </span>
                <span className="qg-item-texto">
                  <b>{p.nome}</b>
                  <small>
                    {t?.nome ?? "Página"}
                    {p.visibilidade === "oculta" ? " · só narrador" : p.visibilidade === "privada" ? " · privada" : ""}
                  </small>
                </span>
              </div>
            );
          })}
        {aba === "notas" &&
          listaNotas.map((n) => (
            <div key={n.id} className="qg-item" tabIndex={aberta ? 0 : -1} {...arrastavel({ tipo: "nota", refId: n.id })}>
              <span className="qg-item-icone">
                <i className="fas fa-note-sticky" />
              </span>
              <span className="qg-item-texto">
                <b>{n.titulo ?? (n.previa.slice(0, 40) || "Anotação")}</b>
                <small>
                  {(n.autorId === meuId ? "sua" : "pública")}
                  {" · "}
                  {(n.sessaoId && sessoes.find((s) => s.id === n.sessaoId) ? rotuloSessao(sessoes.find((s) => s.id === n.sessaoId) as RefSessaoDTO) : "Entre sessões")}
                </small>
              </span>
            </div>
          ))}
        {aba === "sessoes" &&
          listaSessoes.map((s) => (
            <div key={s.id} className="qg-item" tabIndex={aberta ? 0 : -1} {...arrastavel({ tipo: "sessao", refId: s.id })}>
              <span className="qg-item-icone">
                <i className="fas fa-flag" />
              </span>
              <span className="qg-item-texto">
                <b>{rotuloSessao(s)}</b>
                <small>{s.ativa ? "ao vivo" : (dataDaSessao(s) ?? "anterior")}</small>
              </span>
            </div>
          ))}
        {((aba === "paginas" && listaPaginas.length === 0) ||
          (aba === "notas" && listaNotas.length === 0) ||
          (aba === "sessoes" && listaSessoes.length === 0)) && <p className="qg-vazio">Nada encontrado.</p>}
      </div>
    </aside>
  );
}
