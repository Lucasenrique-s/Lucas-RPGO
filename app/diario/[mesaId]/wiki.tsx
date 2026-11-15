"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Swal from "sweetalert2";
import { exigir } from "@/lib/acoes";
import { textoPuroRico } from "@/lib/descricao-rica";
import {
  TIPOS_FICHA,
  rotuloSessao,
  type FichaDiarioDTO,
  type MencaoDiarioDTO,
  type NotaDiarioDTO,
  type NotaWikiDTO,
  type RelacaoDTO,
  type SessaoDiarioDTO,
  type TipoFichaDiario,
  type VersaoFichaDTO,
} from "@/lib/diario-tipos";
import { DescricaoRica } from "@/components/descricao-rica/descricao-rica";
import type { ContextoRico } from "@/components/descricao-rica/atomos";
import type { ConfigMencao } from "@/lib/diario-mencao";
import type { OpcaoRef } from "@/components/descricao-rica/atomos";
import { EditorComImagem, EditoresFicha, avisar, confirmar, enviarImagem, iconeDoTipo } from "./diario-partes";
import {
  definirNotasWikiDiario,
  editarFichaDiario,
  listarVersoesFichaDiario,
  mesclarFichaDiario,
  publicarFichaDiario,
  adicionarRetratoDiario,
  atualizarRetratoDiario,
  removerRetratoDiario,
  removerRelacaoDiario,
  restaurarVersaoFichaDiario,
  revelarFichaDiario,
} from "./actions";
import { NovaRelacao } from "./relacao-editor";
import "./wiki.css";

const tipoDe = (t: TipoFichaDiario) => TIPOS_FICHA.find((x) => x.id === t);

// Em que sessão a página entrou na wiki.
function reveladaEm(f: FichaDiarioDTO, sessoes: SessaoDiarioDTO[]): string | null {
  if (f.visibilidade === "oculta") return null;
  const s = f.reveladaSessaoId ? sessoes.find((x) => x.id === f.reveladaSessaoId) : null;
  return s ? `revelada na ${rotuloSessao(s)}` : null;
}

const fotoDe = (f: FichaDiarioDTO) => f.retratos[0]?.url ?? f.retratoUrl ?? null;

/* ─── Entrada: cartões, uma busca e uma linha de abas ─────────────────────── */

export function Wiki({
  mesaId,
  meuId,
  ehNarrador,
  somenteLeitura,
  fichas,
  notas,
  notasWiki,
  sessoes,
  mencoes,
  relacoes,
  autores,
  participantes,
  contexto,
  refs,
  cfg,
  abertaId,
  aoAbrir,
  aoNovaPagina,
  aoEditar,
  aoAbrirNoCaderno,
  aoAtualizar,
}: {
  mesaId: string;
  meuId: string;
  ehNarrador: boolean;
  somenteLeitura: boolean;
  fichas: FichaDiarioDTO[];
  notas: NotaDiarioDTO[];
  notasWiki: NotaWikiDTO[];
  sessoes: SessaoDiarioDTO[];
  mencoes: MencaoDiarioDTO[];
  relacoes: RelacaoDTO[];
  autores: Record<string, string>;
  // Quem mais está na mesa (pra escolher editores).
  participantes: { id: string; nome: string }[];
  contexto: ContextoRico;
  // O que o @ e o [[ ]] oferecem no editor da biografia.
  refs: OpcaoRef[];
  cfg: ConfigMencao;
  abertaId: string | null;
  aoAbrir: (id: string | null) => void;
  aoNovaPagina: () => void;
  aoEditar: (id: string) => void;
  aoAbrirNoCaderno: (id: string) => void;
  aoAtualizar: () => void;
}) {
  const [tipo, setTipo] = useState<TipoFichaDiario | "tudo">("tudo");
  const [busca, setBusca] = useState("");
  // "Ver como": o narrador confere o que a mesa enxerga.
  const [comoNarrador, setComoNarrador] = useState(true);
  const veOcultas = ehNarrador && comoNarrador;

  const paginas = useMemo(
    () => fichas.filter((f) => f.visibilidade === "publica" || (f.visibilidade === "oculta" && veOcultas)),
    [fichas, veOcultas],
  );
  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return paginas
      .filter((f) => tipo === "tudo" || f.tipo === tipo)
      .filter((f) => !q || [f.nome, ...f.apelidos, textoPuroRico(f.resumo)].join(" ").toLowerCase().includes(q))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [paginas, tipo, busca]);

  const aberta = abertaId ? (paginas.find((f) => f.id === abertaId) ?? null) : null;
  const nomeAutor = (id: string) => (id === meuId ? "Você" : (autores[id] ?? "Jogador"));

  return (
    <div className="wk">
      <div className="wk-topo">
        <div>
          <span className="wk-kicker">Wiki da mesa</span>
          <p className="wk-sub">O que a mesa inteira pode ler. Suas anotações continuam no seu caderno.</p>
        </div>
        {ehNarrador && !somenteLeitura && (
          <div className="wk-ver-como" role="group" aria-label="Ver como">
            <span>Ver como</span>
            <button type="button" className={!comoNarrador ? "on" : ""} aria-pressed={!comoNarrador} onClick={() => setComoNarrador(false)}>
              Jogador
            </button>
            <button type="button" className={comoNarrador ? "on" : ""} aria-pressed={comoNarrador} onClick={() => setComoNarrador(true)}>
              Narrador
            </button>
          </div>
        )}
      </div>

      {aberta ? (
        <PaginaWiki
          key={aberta.id}
          mesaId={mesaId}
          meuId={meuId}
          ehNarrador={ehNarrador}
          somenteLeitura={somenteLeitura}
          ficha={aberta}
          fichas={fichas}
          notas={notas}
          notasWiki={notasWiki}
          sessoes={sessoes}
          mencoes={mencoes}
          relacoes={relacoes}
          autores={autores}
          participantes={participantes}
          contexto={contexto}
          refs={refs}
          cfg={cfg}
          nomeAutor={nomeAutor}
          aoAbrir={aoAbrir}
          aoVoltar={() => aoAbrir(null)}
          aoEditar={aoEditar}
          aoAbrirNoCaderno={aoAbrirNoCaderno}
          aoAtualizar={aoAtualizar}
        />
      ) : (
        <>
          {abertaId && <p className="wk-vazio">Esta página não está na wiki (ou ainda está oculta).</p>}
          <div className="wk-busca-linha">
            <div className="wk-busca">
              <i className="fas fa-magnifying-glass" aria-hidden />
              <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar na wiki…" aria-label="Buscar na wiki" />
            </div>
            <div className="wk-abas" role="group" aria-label="Tipo de página">
              <button type="button" aria-pressed={tipo === "tudo"} onClick={() => setTipo("tudo")}>
                Tudo
              </button>
              {TIPOS_FICHA.map((t) => (
                <button key={t.id} type="button" aria-pressed={tipo === t.id} onClick={() => setTipo(t.id)}>
                  {t.plural}
                </button>
              ))}
            </div>
          </div>

          <div className="wk-cartoes">
            {lista.map((f) => {
              const t = tipoDe(f.tipo);
              const foto = fotoDe(f);
              const oculta = f.visibilidade === "oculta";
              const rodape = reveladaEm(f, sessoes);
              return (
                <button key={f.id} type="button" className={`wk-cartao${oculta ? " wk-cartao--oculto" : ""}`} onClick={() => aoAbrir(f.id)}>
                  <span className="wk-cartao-foto" style={{ background: t?.cor }}>
                    {foto ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={foto} alt="" loading="lazy" />
                    ) : (
                      <i className={`fas ${iconeDoTipo(f.tipo)}`} />
                    )}
                    {oculta && (
                      <span className="wk-cadeado">
                        <i className="fas fa-lock" /> só narrador
                      </span>
                    )}
                  </span>
                  <span className="wk-cartao-corpo">
                    <span className="wk-cartao-nome">{f.nome}</span>
                    <span className="wk-cartao-tipo">
                      <i className={`fas ${t?.icone}`} style={{ color: t?.cor }} /> {t?.nome}
                      {f.campos.status ? ` · ${f.campos.status}` : ""}
                    </span>
                    {f.resumo && <span className="wk-cartao-resumo">{textoPuroRico(f.resumo)}</span>}
                    <span className="wk-cartao-rodape">
                      {[rodape, f.retratos.length > 0 ? `${f.retratos.length} ${f.retratos.length === 1 ? "imagem" : "imagens"}` : null].filter(Boolean).join(" · ") || " "}
                    </span>
                  </span>
                </button>
              );
            })}
            {ehNarrador && !somenteLeitura && (
              <button type="button" className="wk-cartao wk-cartao--novo" onClick={aoNovaPagina}>
                <i className="fas fa-plus" />
                Nova página
              </button>
            )}
          </div>
          {lista.length === 0 && (
            <p className="wk-vazio">
              {paginas.length === 0
                ? "A wiki ainda está vazia. Abra uma página sua e use “Publicar para a mesa”."
                : "Nada encontrado."}
            </p>
          )}
        </>
      )}
    </div>
  );
}

/* ─── Página pública ──────────────────────────────────────────────────────── */

function PaginaWiki({
  mesaId,
  meuId,
  ehNarrador,
  somenteLeitura,
  ficha,
  fichas,
  notas,
  notasWiki,
  sessoes,
  mencoes,
  relacoes,
  autores,
  participantes,
  contexto,
  refs,
  cfg,
  nomeAutor,
  aoAbrir,
  aoVoltar,
  aoEditar,
  aoAbrirNoCaderno,
  aoAtualizar,
}: {
  mesaId: string;
  meuId: string;
  ehNarrador: boolean;
  somenteLeitura: boolean;
  ficha: FichaDiarioDTO;
  fichas: FichaDiarioDTO[];
  notas: NotaDiarioDTO[];
  notasWiki: NotaWikiDTO[];
  sessoes: SessaoDiarioDTO[];
  mencoes: MencaoDiarioDTO[];
  relacoes: RelacaoDTO[];
  autores: Record<string, string>;
  participantes: { id: string; nome: string }[];
  contexto: ContextoRico;
  refs: OpcaoRef[];
  cfg: ConfigMencao;
  nomeAutor: (id: string) => string;
  aoAbrir: (id: string | null) => void;
  aoVoltar: () => void;
  aoEditar: (id: string) => void;
  aoAbrirNoCaderno: (id: string) => void;
  aoAtualizar: () => void;
}) {
  const [historico, setHistorico] = useState(false);
  const [escolhendo, setEscolhendo] = useState(false);
  const [novaRel, setNovaRel] = useState(false);
  const t = tipoDe(ficha.tipo);
  const oculta = ficha.visibilidade === "oculta";
  const porId = useMemo(() => new Map(fichas.map((f) => [f.id, f])), [fichas]);

  const podeEditar = !somenteLeitura && (ficha.autorId === meuId || (ficha.visibilidade === "publica" && (ehNarrador || ficha.editores.includes(meuId))));

  // Membros (quem aponta pra este grupo) e as demais relações.
  const { membros, rels } = useMemo(() => {
    const doGrupo: FichaDiarioDTO[] = [];
    const outras: { id: string; verbo: string; saindo: boolean; outra: FichaDiarioDTO }[] = [];
    for (const r of relacoes) {
      if (r.deId !== ficha.id && r.paraId !== ficha.id) continue;
      const saindo = r.deId === ficha.id;
      const outra = porId.get(saindo ? r.paraId : r.deId);
      if (!outra || (outra.visibilidade !== "publica" && !ehNarrador)) continue;
      if (!saindo && ficha.tipo === "grupo") doGrupo.push(outra);
      else outras.push({ id: r.id, verbo: r.verbo, saindo, outra });
    }
    return { membros: doGrupo, rels: outras };
  }, [relacoes, ficha, porId, ehNarrador]);

  // Anotações da mesa: as marcadas pelos autores, por sessão.
  const porSessao = useMemo(() => {
    const mapa = new Map<string, NotaWikiDTO[]>();
    for (const n of notasWiki.filter((w) => w.fichaId === ficha.id)) {
      const k = n.sessaoId ?? "";
      mapa.set(k, [...(mapa.get(k) ?? []), n]);
    }
    const ordem = [...sessoes.map((s) => s.id), ""];
    return ordem
      .filter((k) => mapa.has(k))
      .map((k) => ({ id: k, sessao: sessoes.find((s) => s.id === k) ?? null, notas: mapa.get(k)!.sort((a, b) => a.criadaEm.localeCompare(b.criadaEm)) }));
  }, [notasWiki, sessoes, ficha.id]);

  // As minhas anotações que citam esta página.
  const minhas = useMemo(() => {
    const ids = new Set(mencoes.filter((m) => m.alvoTipo === "ficha" && m.alvoId === ficha.id && m.origemTipo === "nota").map((m) => m.origemId));
    return notas.filter((n) => n.autorId === meuId && ids.has(n.id));
  }, [mencoes, notas, ficha.id, meuId]);
  const marcadas = useMemo(() => new Set(notasWiki.filter((w) => w.fichaId === ficha.id && w.autorId === meuId).map((w) => w.notaId)), [notasWiki, ficha.id, meuId]);

  const editores = [
    nomeAutor(ficha.autorId),
    ...(autores[ficha.autorId] === "Narrador" ? [] : ["Narrador"]),
    ...ficha.editores.map((id) => nomeAutor(id)),
  ];

  async function tirarRelacao(id: string) {
    try {
      exigir(await removerRelacaoDiario(mesaId, id));
      aoAtualizar();
    } catch (e) {
      avisar(e instanceof Error ? e.message : "Falha ao remover.");
    }
  }

  async function revelar() {
    try {
      exigir(await revelarFichaDiario(mesaId, ficha.id));
      aoAtualizar();
    } catch (e) {
      avisar(e instanceof Error ? e.message : "Falha ao revelar.");
    }
  }

  const meta = [ficha.campos.status, ficha.campos.relacao, ficha.campos.visto ? `visto em ${ficha.campos.visto}` : ""].filter(Boolean);

  return (
    <div className="wk-pagina">
      <nav className="wk-migalha" aria-label="Você está em">
        <button type="button" onClick={aoVoltar}>
          Wiki
        </button>{" "}
        › {t?.plural} › <b>{ficha.nome}</b>
      </nav>

      {oculta && (
        <div className="wk-oculta">
          <i className="fas fa-lock" />
          <span>Oculta para os jogadores. Só o narrador vê, até revelar.</span>
          {ehNarrador && !somenteLeitura && (
            <button type="button" onClick={() => void revelar()}>
              Revelar à mesa
            </button>
          )}
        </div>
      )}

      <div className="wk-grade">
        <aside className="wk-lado">
          <GaleriaWiki mesaId={mesaId} meuId={meuId} ficha={ficha} tipoCor={t?.cor} podeEditar={podeEditar} aoAtualizar={aoAtualizar} />

          <div className="wk-card">
            <b>Quem edita</b>
            <div className="wk-editores">
              {editores.map((n, i) => (
                <span key={`${n}-${i}`} className="wk-avatar" title={n}>
                  {n.trim()[0]?.toUpperCase()}
                </span>
              ))}
            </div>
            {!somenteLeitura && ficha.visibilidade === "publica" && ficha.autorId === meuId && (
              <EditoresFicha key={ficha.editores.join(",")} mesaId={mesaId} ficha={ficha} membros={participantes} aoSalvar={aoAtualizar} />
            )}
          </div>

          {!somenteLeitura && (
            <div className="wk-card wk-card--caderno">
              <b>No seu caderno</b>
              <p>
                {minhas.length === 0
                  ? `Você ainda não anotou nada sobre ${ficha.nome}.`
                  : `Você tem ${minhas.length} ${minhas.length === 1 ? "anotação" : "anotações"} sobre ${ficha.nome}.`}
              </p>
              <button type="button" onClick={() => aoAbrirNoCaderno(ficha.id)}>
                Abrir minha página →
              </button>
            </div>
          )}
        </aside>

        <div className="wk-principal">
          <div className="wk-titulo">
            <h2>{ficha.nome}</h2>
            <div className="wk-acoes">
              {podeEditar && (
                <button type="button" onClick={() => aoEditar(ficha.id)}>
                  <i className="fas fa-pen" /> Editar
                </button>
              )}
              {!somenteLeitura && !oculta && (
                <button type="button" aria-expanded={historico} onClick={() => setHistorico((v) => !v)}>
                  <i className="fas fa-clock-rotate-left" /> Histórico
                </button>
              )}
            </div>
          </div>
          <div className="wk-tags">
            <span style={{ background: t?.cor }}>
              <i className={`fas ${t?.icone}`} /> {t?.nome}
            </span>
            {meta.map((m) => (
              <span key={m} className="wk-tag-neutra">
                {m}
              </span>
            ))}
            {reveladaEm(ficha, sessoes) && <span className="wk-tag-neutra">{reveladaEm(ficha, sessoes)}</span>}
            {ficha.apelidos.map((a) => (
              <span key={a} className="wk-tag-neutra">
                “{a}”
              </span>
            ))}
          </div>

          {historico && <Historico mesaId={mesaId} ficha={ficha} nomeAutor={nomeAutor} podeDesfazer={podeEditar} aoMudou={aoAtualizar} />}

          <Biografia key={`${ficha.id}:${ficha.atualizadaEm}`} mesaId={mesaId} meuId={meuId} ficha={ficha} contexto={contexto} refs={refs} cfg={cfg} podeEditar={podeEditar} aoSalvou={aoAtualizar} />

          {membros.length > 0 && (
            <>
              <h4 className="wk-sec">Membros</h4>
              <div className="wk-minis">
                {membros.map((m) => {
                  const mt = tipoDe(m.tipo);
                  const foto = fotoDe(m);
                  return (
                    <button key={m.id} type="button" onClick={() => aoAbrir(m.id)}>
                      <span className="wk-mini-foto" style={{ background: mt?.cor }}>
                        {foto ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={foto} alt="" />
                        ) : (
                          <i className={`fas ${iconeDoTipo(m.tipo)}`} />
                        )}
                      </span>
                      {m.nome}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {(rels.length > 0 || podeEditar) && (
            <>
              <h4 className="wk-sec wk-sec--linha">
                <span>Relações</span>
                {podeEditar && (
                  <button type="button" className="wk-sec-btn" onClick={() => setNovaRel((v) => !v)} aria-expanded={novaRel}>
                    <i className="fas fa-plus" /> Adicionar relação
                  </button>
                )}
              </h4>
              {novaRel && podeEditar && (
                <NovaRelacao
                  mesaId={mesaId}
                  ficha={ficha}
                  fichas={fichas}
                  aoErro={avisar}
                  aoAdicionou={() => {
                    setNovaRel(false);
                    aoAtualizar();
                  }}
                />
              )}
              {rels.length === 0 && !novaRel && <p className="wk-vazio">Nenhuma relação ainda.</p>}
              <div className="wk-relacoes">
                {rels.map((r) => {
                  const link = (
                    <button type="button" className={`desc-mencao desc-mencao--${r.outra.tipo} wk-link`} onClick={() => aoAbrir(r.outra.id)}>
                      {r.outra.nome}
                    </button>
                  );
                  return (
                    <div key={r.id} className="wk-relacao">
                      {r.saindo ? (
                        <>
                          <span>{r.verbo}</span>
                          {link}
                        </>
                      ) : (
                        <>
                          {link}
                          <span className="wk-relacao-entrada">
                            {r.verbo} {ficha.nome}
                          </span>
                        </>
                      )}
                      {podeEditar && (
                        <button type="button" className="wk-relacao-x" onClick={() => void tirarRelacao(r.id)} aria-label="Remover relação" title="Remover relação">
                          ×
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <h4 className="wk-sec wk-sec--linha">
            <span>Anotações da mesa</span>
            {!somenteLeitura && !oculta && (
              <button type="button" className="wk-sec-btn" onClick={() => setEscolhendo((v) => !v)} aria-expanded={escolhendo}>
                <i className="fas fa-pen-to-square" /> Escolher as minhas
              </button>
            )}
          </h4>
          {escolhendo && (
            <EscolherNotas
              mesaId={mesaId}
              ficha={ficha}
              minhas={minhas}
              marcadas={marcadas}
              sessoes={sessoes}
              aoFechar={() => setEscolhendo(false)}
              aoSalvou={() => {
                setEscolhendo(false);
                aoAtualizar();
              }}
            />
          )}
          {porSessao.length === 0 && <p className="wk-vazio">Ninguém publicou anotações sobre {ficha.nome} ainda.</p>}
          {porSessao.flatMap((g) =>
            g.notas.map((n) => (
              <div key={n.notaId} className="wk-nota">
                <span className="wk-nota-sessao">{g.sessao ? (g.sessao.numero != null ? `Sessão ${g.sessao.numero}` : rotuloSessao(g.sessao)) : "Entre sessões"}</span>
                <div className="wk-nota-corpo">
                  <small>{nomeAutor(n.autorId)}</small>
                  {n.titulo && <b>{n.titulo}</b>}
                  <DescricaoRica texto={n.corpo} contexto={contexto} />
                </div>
              </div>
            )),
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Biografia: texto livre que a mesa escreve e edita ───────────────────── */

function Biografia({
  mesaId,
  meuId,
  ficha,
  contexto,
  refs,
  cfg,
  podeEditar,
  aoSalvou,
}: {
  mesaId: string;
  meuId: string;
  ficha: FichaDiarioDTO;
  contexto: ContextoRico;
  refs: OpcaoRef[];
  cfg: ConfigMencao;
  podeEditar: boolean;
  aoSalvou: () => void;
}) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(ficha.resumo);
  const [salvando, setSalvando] = useState(false);
  // A página não menciona a si mesma.
  const refsSemEla = useMemo(() => refs.filter((r) => !(r.tipo === "ficha" && r.id === ficha.id)), [refs, ficha.id]);

  async function salvar() {
    setSalvando(true);
    try {
      exigir(
        await editarFichaDiario(mesaId, ficha.id, {
          tipo: ficha.tipo,
          nome: ficha.nome,
          apelidos: ficha.apelidos,
          retratoUrl: ficha.retratoUrl,
          campos: ficha.campos,
          resumo: texto,
        }),
      );
      setEditando(false);
      aoSalvou();
    } catch (e) {
      avisar(e instanceof Error ? e.message : "Falha ao salvar a biografia.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
      <h4 className="wk-sec wk-sec--linha">
        <span>Biografia</span>
        {podeEditar && !editando && (
          <button type="button" className="wk-sec-btn" onClick={() => setEditando(true)}>
            <i className="fas fa-pen" /> Editar biografia
          </button>
        )}
      </h4>
      {editando ? (
        <div className="wk-bio-editor">
          <p className="wk-bio-dica">
            Texto livre: escreva do jeito que preferir, com tudo o que a mesa sabe sobre {ficha.nome}, mesmo o que não está em nenhuma anotação. Use @ para citar outras páginas e cole imagens se quiser. Cada edição fica no histórico.
          </p>
          <EditorComImagem
            mesaId={mesaId}
            meuId={meuId}
            valor={texto}
            onChange={setTexto}
            refs={refsSemEla}
            cfg={cfg}
            contexto={contexto}
            placeholder={`Quem é ${ficha.nome}? Conte a história, o que faz, o que já aconteceu…`}
          />
          <div className="wk-escolher-acoes">
            <button type="button" className="diario-btn" onClick={() => { setTexto(ficha.resumo); setEditando(false); }} disabled={salvando}>
              Cancelar
            </button>
            <button type="button" className="diario-btn diario-btn--primario" onClick={() => void salvar()} disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar biografia"}
            </button>
          </div>
        </div>
      ) : ficha.resumo ? (
        <DescricaoRica texto={ficha.resumo} contexto={contexto} />
      ) : (
        <p className="wk-vazio">
          Ninguém escreveu a biografia ainda.{podeEditar ? " Clique em “Editar biografia” e conte o que a mesa sabe." : ""}
        </p>
      )}
    </>
  );
}

/* ─── Galeria de retratos (vários, com envio múltiplo) ───────────────────── */

function GaleriaWiki({
  mesaId,
  meuId,
  ficha,
  tipoCor,
  podeEditar,
  aoAtualizar,
}: {
  mesaId: string;
  meuId: string;
  ficha: FichaDiarioDTO;
  tipoCor?: string;
  podeEditar: boolean;
  aoAtualizar: () => void;
}) {
  const lista = ficha.retratos.length > 0 ? ficha.retratos : ficha.retratoUrl ? [{ id: "legado", url: ficha.retratoUrl, legenda: "" }] : [];
  const [sel, setSel] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const atual = lista[Math.min(sel, Math.max(0, lista.length - 1))];

  // Vários arquivos de uma vez: sobem em fila; as falhas são avisadas juntas.
  async function adicionar(arquivos: File[]) {
    setEnviando(true);
    const falhas: string[] = [];
    let enviados = 0;
    for (const arq of arquivos) {
      try {
        const url = await enviarImagem(mesaId, meuId, arq);
        exigir(await adicionarRetratoDiario(mesaId, ficha.id, url));
        enviados++;
      } catch (e) {
        falhas.push(`${arq.name}: ${e instanceof Error ? e.message : "falhou"}`);
        // Passou do limite de retratos: não adianta insistir nos demais.
        if (e instanceof Error && /no máximo/i.test(e.message)) break;
      }
    }
    setEnviando(false);
    if (enviados > 0) {
      setSel(lista.length);
      aoAtualizar();
    }
    if (falhas.length) avisar(falhas.join("\n"));
  }

  async function mudar(id: string, mudanca: { legenda?: string; principal?: boolean }) {
    try {
      exigir(await atualizarRetratoDiario(mesaId, id, mudanca));
      if (mudanca.principal) setSel(0);
      aoAtualizar();
    } catch (e) {
      avisar(e instanceof Error ? e.message : "Falha ao salvar.");
    }
  }

  async function remover(id: string) {
    if (!(await confirmar("Remover este retrato?"))) return;
    try {
      exigir(await removerRetratoDiario(mesaId, id));
      setSel(0);
      aoAtualizar();
    } catch (e) {
      avisar(e instanceof Error ? e.message : "Falha ao remover.");
    }
  }

  return (
    <>
      <div className="wk-retrato" style={{ background: tipoCor }}>
        {atual ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={atual.url} alt={atual.legenda} />
        ) : (
          <i className={`fas ${iconeDoTipo(ficha.tipo)}`} />
        )}
      </div>
      {atual && podeEditar && atual.id !== "legado" ? (
        <input
          key={atual.id}
          className="wk-legenda"
          type="text"
          maxLength={120}
          defaultValue={atual.legenda}
          placeholder="Legenda (ex.: cartaz · Sessão 8)"
          aria-label="Legenda da imagem"
          onBlur={(e) => e.target.value !== atual.legenda && void mudar(atual.id, { legenda: e.target.value })}
        />
      ) : (
        atual?.legenda && <div className="wk-leg">{atual.legenda}</div>
      )}
      <div className="wk-galeria">
        {lista.map((r, i) => (
          <button key={r.id} type="button" className={i === sel ? "on" : ""} onClick={() => setSel(i)} title={r.legenda || `Imagem ${i + 1}`} aria-label={r.legenda || `Imagem ${i + 1}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={r.url} alt="" />
          </button>
        ))}
        {podeEditar && (
          <label className="wk-galeria-mais" title="Adicionar imagens (pode escolher várias)">
            {enviando ? "…" : "+"}
            <input
              type="file"
              accept="image/*"
              multiple
              hidden
              disabled={enviando}
              onChange={(e) => {
                const arqs = [...(e.target.files ?? [])];
                e.target.value = "";
                if (arqs.length) void adicionar(arqs);
              }}
            />
          </label>
        )}
      </div>
      {atual && podeEditar && atual.id !== "legado" && (
        <div className="wk-retrato-acoes">
          {sel > 0 && (
            <button type="button" onClick={() => void mudar(atual.id, { principal: true })}>
              tornar principal
            </button>
          )}
          <button type="button" onClick={() => void remover(atual.id)}>
            remover
          </button>
        </div>
      )}
    </>
  );
}

/* ─── Escolher as minhas anotações que aparecem na página ─────────────────── */

function EscolherNotas({
  mesaId,
  ficha,
  minhas,
  marcadas,
  sessoes,
  aoFechar,
  aoSalvou,
}: {
  mesaId: string;
  ficha: FichaDiarioDTO;
  minhas: NotaDiarioDTO[];
  marcadas: Set<string>;
  sessoes: SessaoDiarioDTO[];
  aoFechar: () => void;
  aoSalvou: () => void;
}) {
  const [sel, setSel] = useState<string[]>([...marcadas]);
  const [salvando, setSalvando] = useState(false);
  async function salvar() {
    setSalvando(true);
    try {
      exigir(await definirNotasWikiDiario(mesaId, ficha.id, sel));
      aoSalvou();
    } catch (e) {
      avisar(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setSalvando(false);
    }
  }
  return (
    <div className="wk-escolher">
      {minhas.length === 0 && <p className="wk-vazio">Escreva @{ficha.nome} numa anotação sua e ela aparece aqui para você escolher.</p>}
      <ListaNotas notas={minhas} sessoes={sessoes} sel={sel} aoMudar={setSel} />
      <div className="wk-escolher-acoes">
        <button type="button" className="diario-btn" onClick={aoFechar} disabled={salvando}>
          Cancelar
        </button>
        <button type="button" className="diario-btn diario-btn--primario" onClick={() => void salvar()} disabled={salvando}>
          Salvar
        </button>
      </div>
    </div>
  );
}

function ListaNotas({
  notas,
  sessoes,
  sel,
  aoMudar,
  avisoPrivado,
}: {
  notas: NotaDiarioDTO[];
  sessoes: SessaoDiarioDTO[];
  sel: string[];
  aoMudar: (ids: string[]) => void;
  // Nomes de páginas privadas que a anotação cita (o texto delas vazaria).
  avisoPrivado?: (n: NotaDiarioDTO) => string[];
}) {
  return (
    <ul className="wk-notas-lista">
      {notas.map((n) => {
        const s = sessoes.find((x) => x.id === n.sessaoId);
        const privados = avisoPrivado?.(n) ?? [];
        return (
          <li key={n.id}>
            <label className="diario-check">
              <input type="checkbox" checked={sel.includes(n.id)} onChange={(e) => aoMudar(e.target.checked ? [...sel, n.id] : sel.filter((x) => x !== n.id))} />{" "}
              <span>
                <small>{s ? rotuloSessao(s) : "Entre sessões"}</small>
                <br />
                {n.titulo ? <b>{n.titulo}: </b> : null}
                {textoPuroRico(n.corpo).slice(0, 140)}
                {privados.length > 0 && (
                  <small className="wk-aviso-priv">
                    <br />
                    <i className="fas fa-triangle-exclamation" /> cita {privados.join(", ")}, que {privados.length === 1 ? "ainda é privada" : "ainda são privadas"}
                  </small>
                )}
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

/* ─── Histórico de edições, com desfazer ──────────────────────────────────── */

function Historico({
  mesaId,
  ficha,
  nomeAutor,
  podeDesfazer,
  aoMudou,
}: {
  mesaId: string;
  ficha: FichaDiarioDTO;
  nomeAutor: (id: string) => string;
  podeDesfazer: boolean;
  aoMudou: () => void;
}) {
  const [versoes, setVersoes] = useState<VersaoFichaDTO[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);

  // Recarrega quando a página muda (edição de outra pessoa) ou depois de voltar a uma versão.
  const [recarga, setRecarga] = useState(0);
  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const r = exigir(await listarVersoesFichaDiario(mesaId, ficha.id));
        if (vivo) setVersoes(r.versoes);
      } catch (e) {
        if (vivo) setErro(e instanceof Error ? e.message : "Falha ao carregar o histórico.");
      }
    })();
    return () => {
      vivo = false;
    };
  }, [mesaId, ficha.id, ficha.atualizadaEm, recarga]);

  async function voltar(v: VersaoFichaDTO) {
    const r = await Swal.fire({
      icon: "question",
      title: "Voltar a esta versão?",
      text: "O texto de agora também fica no histórico, então dá para refazer.",
      showCancelButton: true,
      confirmButtonText: "Voltar a esta versão",
      cancelButtonText: "Cancelar",
      background: "var(--bg-card)",
      color: "var(--text-main)",
    });
    if (!r.isConfirmed) return;
    try {
      exigir(await restaurarVersaoFichaDiario(mesaId, v.id));
      setRecarga((n) => n + 1);
      aoMudou();
    } catch (e) {
      avisar(e instanceof Error ? e.message : "Falha ao restaurar.");
    }
  }

  return (
    <div className="wk-historico">
      <b>Histórico de edições</b>
      {erro && <p className="wk-vazio">{erro}</p>}
      {!erro && versoes === null && <p className="wk-vazio">Carregando…</p>}
      {versoes && versoes.length === 0 && <p className="wk-vazio">Ninguém editou esta página ainda.</p>}
      <ul>
        {versoes?.map((v) => (
          <li key={v.id}>
            <div className="wk-hist-linha">
              <span>
                {new Date(v.criadaEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} · {nomeAutor(v.editorId)} editou
              </span>
              <button type="button" className="diario-btn" onClick={() => setAberta(aberta === v.id ? null : v.id)}>
                {aberta === v.id ? "Ocultar" : "Ver como era"}
              </button>
              {podeDesfazer && (
                <button type="button" className="diario-btn" onClick={() => void voltar(v)}>
                  <i className="fas fa-rotate-left" /> Voltar a esta
                </button>
              )}
            </div>
            {aberta === v.id && <p className="wk-hist-texto">{textoPuroRico(v.resumo) || "(sem resumo)"}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ─── Publicar para a mesa ────────────────────────────────────────────────── */

// Diálogo de publicar uma página pessoal: a biografia, os retratos e as relações vão; as
// anotações só se o autor marcar. Se já existe página pública com o nome, oferece mesclar.
export function PublicarDialogo({
  mesaId,
  meuId,
  ficha,
  fichas,
  notas,
  mencoes,
  sessoes,
  ehNarrador,
  aoFechar,
  aoMudou,
}: {
  mesaId: string;
  meuId: string;
  ficha: FichaDiarioDTO;
  fichas: FichaDiarioDTO[];
  notas: NotaDiarioDTO[];
  mencoes: MencaoDiarioDTO[];
  sessoes: SessaoDiarioDTO[];
  ehNarrador: boolean;
  aoFechar: () => void;
  // `abrirId`: a página pública em que a minha foi mesclada.
  aoMudou: (abrirId?: string) => void;
}) {
  const minhas = useMemo(() => {
    const ids = new Set(mencoes.filter((m) => m.alvoTipo === "ficha" && m.alvoId === ficha.id && m.origemTipo === "nota").map((m) => m.origemId));
    return notas.filter((n) => n.autorId === meuId && ids.has(n.id));
  }, [mencoes, notas, ficha.id, meuId]);
  const [sel, setSel] = useState<string[]>([]);
  const [ocupado, setOcupado] = useState(false);

  // Páginas privadas que cada anotação cita (o nome delas apareceria no texto publicado).
  const avisoPrivado = (n: NotaDiarioDTO) =>
    mencoes
      .filter((m) => m.origemTipo === "nota" && m.origemId === n.id && m.alvoTipo === "ficha" && m.alvoId !== ficha.id)
      .map((m) => fichas.find((f) => f.id === m.alvoId))
      .filter((f): f is FichaDiarioDTO => !!f && f.visibilidade !== "publica")
      .map((f) => f.nome);

  async function publicar(visibilidade: "publica" | "oculta") {
    if (ocupado) return;
    setOcupado(true);
    try {
      const ids = visibilidade === "publica" ? sel : [];
      const r = exigir(await publicarFichaDiario(mesaId, ficha.id, visibilidade, false, ids));
      if (!r.conflito) return aoMudou();
      // Já existe uma página pública com esse nome (ou alguém acabou de publicar): mesclar.
      const c = r.conflito;
      const resp = await Swal.fire({
        icon: "question",
        title: `Já existe “${c.nome}” na wiki`,
        text: "Mesclar liga as suas menções à página pública e guarda o que você sabia como anotação privada (as anotações marcadas passam a aparecer lá). Publicar assim mesmo cria uma segunda página.",
        showCancelButton: true,
        showDenyButton: true,
        confirmButtonText: "Mesclar",
        denyButtonText: "Publicar assim mesmo",
        cancelButtonText: "Cancelar",
        background: "var(--bg-card)",
        color: "var(--text-main)",
      });
      if (resp.isConfirmed) {
        const m = exigir(await mesclarFichaDiario(mesaId, ficha.id, c.id, ids));
        return aoMudou(m.destinoId);
      }
      if (resp.isDenied) {
        exigir(await publicarFichaDiario(mesaId, ficha.id, "publica", true, ids));
        return aoMudou();
      }
    } catch (e) {
      avisar(e instanceof Error ? e.message : "Falha ao publicar.");
    } finally {
      setOcupado(false);
    }
  }

  return createPortal(
    <div className="wk-modal-fundo" onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}>
      <div className="wk-modal" role="dialog" aria-label={`Publicar ${ficha.nome}`}>
        <h3>Publicar “{ficha.nome}” na wiki</h3>
        <p className="wk-modal-p">
          <i className="fas fa-check" /> Vão para a mesa: a biografia, os retratos e as relações.
          <br />
          <i className="fas fa-lock" /> Não vai: o que você sabe. Só as anotações que você marcar abaixo aparecem em “Anotações da mesa”.
        </p>
        <div className="wk-modal-lista">
          {minhas.length === 0 ? (
            <p className="wk-vazio">Você não tem anotações que citam {ficha.nome}. Dá para marcar depois, na página.</p>
          ) : (
            <ListaNotas notas={minhas} sessoes={sessoes} sel={sel} aoMudar={setSel} avisoPrivado={avisoPrivado} />
          )}
        </div>
        <div className="wk-modal-acoes">
          <button type="button" className="diario-btn" onClick={aoFechar} disabled={ocupado}>
            Cancelar
          </button>
          {ehNarrador && (
            <button type="button" className="diario-btn" onClick={() => void publicar("oculta")} disabled={ocupado} title="Aparece na wiki só para o narrador, até você revelar">
              <i className="fas fa-lock" /> Guardar oculta
            </button>
          )}
          <button type="button" className="diario-btn diario-btn--primario" onClick={() => void publicar("publica")} disabled={ocupado}>
            <i className="fas fa-earth-americas" /> {ehNarrador ? "Revelar à mesa" : "Publicar"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
