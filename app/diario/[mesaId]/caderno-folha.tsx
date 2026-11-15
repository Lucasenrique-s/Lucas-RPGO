"use client";

import { useMemo, useState } from "react";
import {
  TIPOS_FICHA,
  rotuloSessao,
  type FichaDiarioDTO,
  type MencaoDiarioDTO,
  type NotaDiarioDTO,
  type RelacaoDTO,
  type SessaoDiarioDTO,
} from "@/lib/diario-tipos";
import { DescricaoRica } from "@/components/descricao-rica/descricao-rica";
import type { ContextoRico } from "@/components/descricao-rica/atomos";
import { iconeDoTipo } from "./diario-partes";

// A folha da entidade: a página gerada sobre alguém ou algo, que abre na página da
// direita do caderno. Só lê; editar, publicar e mexer nas relações é na ficha completa.
export function FolhaEntidade({
  ficha,
  fichas,
  notas,
  sessoes,
  mencoes,
  relacoes,
  contexto,
  paginaNota,
  aoAbrirFicha,
  aoIrNota,
  aoAbrirCompleta,
  aoVoltar,
}: {
  ficha: FichaDiarioDTO;
  fichas: FichaDiarioDTO[];
  // Só as minhas anotações: "o que eu sei".
  notas: NotaDiarioDTO[];
  sessoes: SessaoDiarioDTO[];
  mencoes: MencaoDiarioDTO[];
  relacoes: RelacaoDTO[];
  contexto: ContextoRico;
  // Página (coluna) onde cada anotação está no caderno; sem entrada = ainda não medida.
  paginaNota: Record<string, number>;
  aoAbrirFicha: (id: string) => void;
  aoIrNota: (id: string) => void;
  aoAbrirCompleta: (id: string) => void;
  aoVoltar: () => void;
}) {
  const [sel, setSel] = useState(0);
  const tipo = TIPOS_FICHA.find((t) => t.id === ficha.tipo);
  const retratos = ficha.retratos.length > 0 ? ficha.retratos : ficha.retratoUrl ? [{ id: "legado", url: ficha.retratoUrl, legenda: "" }] : [];
  const retrato = retratos[Math.min(sel, retratos.length - 1)];
  const porId = useMemo(() => new Map(fichas.map((f) => [f.id, f])), [fichas]);

  // As minhas anotações que citam esta página, por sessão (a mais recente primeiro).
  const porSessao = useMemo(() => {
    const ids = new Set(mencoes.filter((m) => m.alvoTipo === "ficha" && m.alvoId === ficha.id && m.origemTipo === "nota").map((m) => m.origemId));
    const mapa = new Map<string, NotaDiarioDTO[]>();
    for (const n of notas) {
      if (!ids.has(n.id)) continue;
      const k = n.sessaoId ?? "";
      mapa.set(k, [...(mapa.get(k) ?? []), n]);
    }
    const sessaoDe = (id: string) => sessoes.find((s) => s.id === id);
    return [...mapa.entries()]
      .map(([id, lista]) => ({ id, sessao: sessaoDe(id) ?? null, notas: lista.sort((a, b) => a.criadaEm.localeCompare(b.criadaEm)) }))
      .sort((a, b) => (b.notas[0]?.criadaEm ?? "").localeCompare(a.notas[0]?.criadaEm ?? ""));
  }, [mencoes, notas, sessoes, ficha.id]);

  const rels = relacoes.filter((r) => r.deId === ficha.id || r.paraId === ficha.id);
  const campos = [ficha.campos.status, ficha.campos.relacao, ficha.campos.visto ? `visto em ${ficha.campos.visto}` : ""].filter(Boolean);

  return (
    <div className="cad-folha-ent">
      <div className="cad-clipe">
        <span>
          <i className="fas fa-paperclip" /> página gerada das suas anotações
        </span>
        <button type="button" onClick={aoVoltar}>
          voltar ao texto
        </button>
      </div>

      <div className="cad-ent-cab">
        <div className="cad-ent-retratos">
          <div className="cad-moldura cad-moldura--foto">
            <div className="cad-foto" style={{ background: tipo?.cor }}>
              {retrato ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={retrato.url} alt={retrato.legenda} />
              ) : (
                <i className={`fas ${iconeDoTipo(ficha.tipo)}`} />
              )}
            </div>
          </div>
          {retratos.length > 1 && (
            <div className="cad-ent-minis">
              {retratos.map((r, i) => (
                <button key={r.id} type="button" className={i === sel ? "on" : ""} onClick={() => setSel(i)} aria-label={r.legenda || `Retrato ${i + 1}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.url} alt="" />
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <h3 className="cad-ent-nome">{ficha.nome}</h3>
          <div className="cad-sub">
            <i className={`fas ${tipo?.icone ?? "fa-address-card"}`} style={{ color: tipo?.cor }} /> {tipo?.nome}
            {campos.length > 0 ? ` · ${campos.join(" · ")}` : ""}
          </div>
          {ficha.apelidos.length > 0 && (
            <div className="cad-sub">
              também chamado de <em>{ficha.apelidos.join(", ")}</em>
            </div>
          )}
          {retrato?.legenda && <div className="cad-sub">{retrato.legenda}</div>}
        </div>
      </div>

      {ficha.resumo && <DescricaoRica texto={ficha.resumo} contexto={contexto} />}

      {rels.length > 0 && (
        <>
          <h4 className="cad-ent-sec">Relações</h4>
          <ul className="cad-ent-rels">
            {rels.map((r) => {
              const saindo = r.deId === ficha.id;
              const outra = porId.get(saindo ? r.paraId : r.deId);
              if (!outra) return null;
              return (
                <li key={r.id}>
                  <span>{saindo ? r.verbo : `${r.verbo} (de)`}</span>{" "}
                  <button type="button" className={`desc-mencao desc-mencao--${outra.tipo} cad-ent-link`} onClick={() => aoAbrirFicha(outra.id)}>
                    {outra.nome}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <h4 className="cad-ent-sec">O que eu sei</h4>
      {porSessao.length === 0 && <p className="cad-vazio">Você ainda não anotou nada sobre {ficha.nome}. Escreva @{ficha.nome} numa anotação e ela aparece aqui.</p>}
      {porSessao.map((g) => (
        <div key={g.id || "entre"} className="cad-ent-sessao">
          <div className="cad-ent-sessao-rot">{g.sessao ? rotuloSessao(g.sessao) : "Entre sessões"}</div>
          {g.notas.map((n) => (
            <button key={n.id} type="button" className="cad-ent-trecho" onClick={() => aoIrNota(n.id)} disabled={paginaNota[n.id] === undefined}>
              {n.titulo && <b>{n.titulo}: </b>}
              <DescricaoRica texto={n.corpo} contexto={contexto} />
              {paginaNota[n.id] !== undefined && <small>p. {paginaNota[n.id] + 1}</small>}
            </button>
          ))}
        </div>
      ))}

      <button type="button" className="cad-ent-completa" onClick={() => aoAbrirCompleta(ficha.id)}>
        ficha completa: editar, relações, retratos e publicar <i className="fas fa-up-right-from-square" />
      </button>
    </div>
  );
}
