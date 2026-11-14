"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { imagensDeRica, textoPuroRico, type TipoRef } from "@/lib/descricao-rica";
import {
  TIPOS_FICHA,
  rotuloSessao,
  rotuloDia,
  type CalendarioDiarioDTO,
  type FichaDiarioDTO,
  type MencaoDiarioDTO,
  type NotaDiarioDTO,
  type SessaoDiarioDTO,
  type TipoFichaDiario,
} from "@/lib/diario-tipos";
import { montarLinha, type ItemLinha, type SecaoLinha } from "@/lib/diario-linha";
import type { ContextoRico, OpcaoRef } from "@/components/descricao-rica/atomos";
import {
  FichaDetalhe,
  FichaForm,
  NomearSessao,
  NotaCard,
  NotaForm,
  alternarVisibilidadeNota,
  avisar,
  confirmar,
  iconeDoTipo,
} from "./diario-partes";
import { apagarNotaDiario } from "./actions";
import { CapturaRapida } from "./captura-rapida";
import { DiarioAoVivo } from "./ao-vivo";
import { Caderno } from "./caderno";
import { exigir } from "@/lib/acoes";

type Props = {
  mesaId: string;
  meuId: string;
  ehNarrador: boolean;
  fichas: FichaDiarioDTO[];
  notas: NotaDiarioDTO[];
  sessoes: SessaoDiarioDTO[];
  mencoes: MencaoDiarioDTO[];
  autores: Record<string, string>;
  calendario: CalendarioDiarioDTO | null;
  // Escopo com que a tela abre (a aba da ficha abre no "Meu diário").
  escopoInicial?: Escopo;
  // Atalho Ctrl+J / N neste componente. Desligue onde já há um atalho global.
  atalho?: boolean;
  // Só leitura (narrador vendo o diário de um jogador): sem criar, editar nem publicar.
  somenteLeitura?: boolean;
  avisoLeitura?: string;
};

type Filtro = "tudo" | "nota" | TipoFichaDiario;
// De quem é o que aparece: tudo o que posso ler, só o meu, ou só o público.
type Escopo = "tudo" | "meu" | "publico";

// O que a gaveta lateral mostra.
type Gaveta =
  | { m: "ficha"; id: string }
  | { m: "nota"; id: string }
  | { m: "editFicha"; id: string }
  | { m: "editNota"; id: string }
  | { m: "novaFicha" }
  | { m: "novaNota"; sessaoId: string | null };

// Sessões além das mais recentes começam recolhidas.
const ABERTAS_AO_INICIAR = 3;

const resumoUmaLinha = (texto: string, max: number) => {
  const t = textoPuroRico(texto).replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

export function DiarioView({
  mesaId,
  meuId,
  ehNarrador,
  fichas,
  notas,
  sessoes,
  mencoes,
  autores,
  calendario,
  escopoInicial = "tudo",
  atalho = true,
  somenteLeitura = false,
  avisoLeitura,
}: Props) {
  const router = useRouter();
  const [filtro, setFiltro] = useState<Filtro>("tudo");
  const [busca, setBusca] = useState("");
  const [filtroAutor, setFiltroAutor] = useState("todos");
  const [escopo, setEscopo] = useState<Escopo>(escopoInicial);
  const [gaveta, setGaveta] = useState<Gaveta | null>(null);
  const [novoAberto, setNovoAberto] = useState(false);
  // Como ler o diário: a linha do tempo ou o caderno (lembrado no aparelho).
  const [modo, setModoEstado] = useState<"linha" | "caderno">("linha");
  // Cada clique no botão de modo, dentro do caderno, pede pra ele descer da tela.
  const [pedidoSair, setPedidoSair] = useState(0);
  const setModo = useCallback((m: "linha" | "caderno") => {
    setModoEstado(m);
    try {
      window.localStorage.setItem("rpgo:diario:modo", m);
    } catch {
      /* sem storage: só não lembra */
    }
  }, []);
  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        if (window.localStorage.getItem("rpgo:diario:modo") === "caderno") setModoEstado("caderno");
      } catch {
        /* sem storage: fica na linha do tempo */
      }
    }, 0);
    return () => window.clearTimeout(t);
  }, []);
  const [capturando, setCapturando] = useState(false);
  const abrirCaptura = useCallback(() => setCapturando(true), []);
  const fecharCaptura = useCallback(() => setCapturando(false), []);
  const [nomeando, setNomeando] = useState<string | null>(null);
  // Seções que a pessoa abriu ou fechou à mão (o resto segue o padrão).
  const [manual, setManual] = useState<Record<string, boolean>>({});

  const atualizar = useCallback(() => router.refresh(), [router]);
  const nomeAutor = (id: string) => (id === meuId ? "Você" : (autores[id] ?? "Jogador"));

  const autoresPresentes = useMemo(
    () => [...new Set([...notas.map((n) => n.autorId), ...fichas.map((f) => f.autorId)])],
    [notas, fichas],
  );

  const membros = useMemo(
    () => Object.entries(autores).filter(([id]) => id !== meuId).map(([id, nome]) => ({ id, nome })),
    [autores, meuId],
  );

  const secoes = useMemo(() => montarLinha(sessoes, fichas, notas), [sessoes, fichas, notas]);

  const q = busca.trim().toLowerCase();
  const passa = useCallback(
    (it: ItemLinha) => {
      if (it.k === "ficha") {
        const f = it.ficha;
        if (filtro !== "tudo" && filtro !== f.tipo) return false;
        if (filtroAutor !== "todos" && f.autorId !== filtroAutor) return false;
        if (escopo === "meu" && f.autorId !== meuId) return false;
        if (escopo === "publico" && f.visibilidade !== "publica") return false;
        if (!q) return true;
        return [f.nome, ...f.apelidos, textoPuroRico(f.resumo)].join(" ").toLowerCase().includes(q);
      }
      const n = it.nota;
      if (filtro !== "tudo" && filtro !== "nota") return false;
      if (filtroAutor !== "todos" && n.autorId !== filtroAutor) return false;
      if (escopo === "meu" && n.autorId !== meuId) return false;
      if (escopo === "publico" && n.visibilidade !== "publica") return false;
      if (!q) return true;
      return [textoPuroRico(n.corpo), ...n.tags].join(" ").toLowerCase().includes(q);
    },
    [filtro, filtroAutor, escopo, meuId, q],
  );

  const filtrando = filtro !== "tudo" || q !== "" || filtroAutor !== "todos" || escopo !== "tudo";
  const visiveis = useMemo(
    () =>
      secoes
        .map((s) => ({ s, itens: s.itens.filter(passa) }))
        // Filtrando, só aparece o marco que tem resultado.
        .filter((x) => !filtrando || x.itens.length > 0),
    [secoes, passa, filtrando],
  );

  const refsOpcoes = useMemo<OpcaoRef[]>(
    () => [
      ...fichas.map((f): OpcaoRef => ({ tipo: "ficha", id: f.id, nome: f.nome })),
      ...sessoes.map((s): OpcaoRef => ({ tipo: "sessao", id: s.id, nome: rotuloSessao(s) })),
      ...(calendario?.eventos ?? []).map((e): OpcaoRef => ({ tipo: "evento", id: e.id, nome: e.titulo })),
    ],
    [fichas, sessoes, calendario],
  );

  const abrirRef = useCallback((tipo: TipoRef, id: string) => {
    if (tipo === "ficha") {
      setGaveta({ m: "ficha", id });
    } else if (tipo === "dia" || tipo === "evento") {
      // O calendário da mesa tem página própria.
      router.push(`/calendario/${mesaId}`);
    } else if (tipo === "sessao") {
      setGaveta(null);
      setManual((m) => ({ ...m, [`sessao-${id}`]: true }));
      window.setTimeout(() => document.getElementById(`sessao-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    }
  }, [router, mesaId]);

  const contexto = useMemo<ContextoRico>(() => {
    const refs: NonNullable<ContextoRico["refs"]> = {};
    for (const f of fichas) refs[`ficha:${f.id}`] = { titulo: f.nome, icone: iconeDoTipo(f.tipo), selo: "Ficha do diário" };
    for (const s of sessoes) refs[`sessao:${s.id}`] = { titulo: rotuloSessao(s), icone: "fa-book-open", selo: "Sessão" };
    for (const e of calendario?.eventos ?? []) {
      refs[`evento:${e.id}`] = {
        titulo: e.titulo,
        icone: "fa-calendar-check",
        selo: "Evento do calendário",
        texto: rotuloDia(e.dataDias, calendario!.config),
      };
    }
    return {
      refs,
      aoAbrirRef: abrirRef,
      ...(calendario ? { calendario: { config: calendario.config, hoje: calendario.hoje } } : {}),
    };
  }, [fichas, sessoes, calendario, abrirRef]);

  // Esc fecha a gaveta.
  useEffect(() => {
    if (!gaveta) return;
    const fechar = (e: KeyboardEvent) => e.key === "Escape" && setGaveta(null);
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [gaveta]);

  const sessaoAtiva = sessoes.find((s) => s.ativa) ?? null;
  const aberta = (s: SecaoLinha, indice: number) => {
    if (filtrando) return true;
    if (s.id in manual) return manual[s.id];
    return indice < ABERTAS_AO_INICIAR;
  };

  const fichaDe = (id: string) => fichas.find((f) => f.id === id) ?? null;
  const notaDe = (id: string) => notas.find((n) => n.id === id) ?? null;

  async function apagarNota(id: string) {
    if (!(await confirmar("Apagar esta anotação?"))) return;
    try {
      exigir(await apagarNotaDiario(mesaId, id));
      setGaveta(null);
      atualizar();
    } catch (e) {
      avisar(e instanceof Error ? e.message : "Falha ao apagar.");
    }
  }

  return (
    <>
      <DiarioAoVivo mesaId={mesaId} />
      <div className="diario-barra">
        {/* Um botão só: mostra como o diário está sendo lido e, ao clicar, troca. */}
        <button
          type="button"
          className="diario-aba"
          onClick={() => (modo === "linha" ? setModo("caderno") : setPedidoSair((n) => n + 1))}
          title={modo === "linha" ? "Ler como caderno" : "Ler como linha do tempo"}
        >
          <i className={`fas ${modo === "linha" ? "fa-timeline" : "fa-book"}`} /> {modo === "linha" ? "Linha do tempo" : "Caderno"}{" "}
          <i className="fas fa-repeat" aria-hidden />
        </button>
      </div>
      {modo === "linha" && (
        <>
      <div className="diario-barra">
        {(
          [
            ["tudo", "Tudo", "fa-layer-group"],
            ["meu", "Meu diário", "fa-lock"],
            ["publico", "Público", "fa-earth-americas"],
          ] as const
        ).map(([id, nome, icone]) => (
          <button key={id} type="button" className="diario-aba" aria-pressed={escopo === id} onClick={() => setEscopo(id)}>
            <i className={`fas ${icone}`} /> {nome}
          </button>
        ))}
      </div>
      <div className="diario-barra">
        <button type="button" className="diario-aba" aria-pressed={filtro === "tudo"} onClick={() => setFiltro("tudo")}>
          Tudo
        </button>
        {TIPOS_FICHA.map((t) => (
          <button key={t.id} type="button" className="diario-aba" aria-pressed={filtro === t.id} onClick={() => setFiltro(t.id)}>
            <i className={`fas ${t.icone}`} /> {t.plural}
          </button>
        ))}
        <button type="button" className="diario-aba" aria-pressed={filtro === "nota"} onClick={() => setFiltro("nota")}>
          <i className="fas fa-note-sticky" /> Anotações
        </button>
      </div>
      <div className="diario-barra">
        <input
          type="search"
          className="diario-busca"
          placeholder="Buscar no diário"
          aria-label="Buscar no diário"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        {ehNarrador && (
          <select value={filtroAutor} onChange={(e) => setFiltroAutor(e.target.value)} aria-label="Diário de quem">
            <option value="todos">Todos os diários</option>
            {autoresPresentes.map((id) => (
              <option key={id} value={id}>
                {nomeAutor(id)}
              </option>
            ))}
          </select>
        )}
        {!somenteLeitura && (
          <div className="diario-novo">
            <button type="button" className="diario-btn diario-btn--primario" onClick={() => setNovoAberto((v) => !v)} aria-expanded={novoAberto}>
              <i className="fas fa-plus" /> Novo
            </button>
            {novoAberto && (
              <div className="diario-novo-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setNovoAberto(false);
                    setCapturando(true);
                  }}
                >
                  <i className="fas fa-bolt" /> Anotação rápida <small>Ctrl+J</small>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setNovoAberto(false);
                    setGaveta({ m: "novaNota", sessaoId: sessaoAtiva?.id ?? null });
                  }}
                >
                  <i className="fas fa-note-sticky" /> Anotação completa
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setNovoAberto(false);
                    setGaveta({ m: "novaFicha" });
                  }}
                >
                  <i className="fas fa-address-card" /> Ficha
                </button>
              </div>
            )}
          </div>
        )}
      </div>

        </>
      )}

      <p className="diario-aviso">
        <i className="fas fa-eye" />{" "}
        {avisoLeitura ??
          (ehNarrador
          ? "Você vê o diário de todos os jogadores."
          : "Suas anotações são privadas, mas o narrador também pode lê-las.")}
      </p>

      {modo === "caderno" ? (
        <Caderno
          mesaId={mesaId}
          meuId={meuId}
          titulo={autores[meuId] ?? "Meu caderno"}
          fichas={fichas}
          notas={notas}
          sessoes={sessoes}
          calendario={calendario}
          contexto={contexto}
          refs={refsOpcoes}
          somenteLeitura={somenteLeitura}
          aoAbrirFicha={(id) => setGaveta({ m: "ficha", id })}
          aoAbrirNota={(id) => setGaveta({ m: "nota", id })}
          aoSalvou={atualizar}
          pedidoSair={pedidoSair}
          aoSair={() => setModo("linha")}
        />
      ) : (
      <div className="diario-linha">
        {visiveis.length === 0 && (
          <p className="diario-vazio">{filtrando ? "Nada encontrado com esse filtro." : "O diário está vazio. Use “Novo” para começar."}</p>
        )}
        {visiveis.map(({ s, itens }, i) => {
          const aberto = aberta(s, i);
          const sessao = s.sessao;
          return (
            <section key={s.id} id={s.id} className="diario-secao">
              <div className="diario-marco">
                {sessao ? (
                  <span className={`diario-no${sessao.ativa ? " diario-no--ao-vivo" : ""}`}>
                    {sessao.ativa ? <i className="fas fa-pen" /> : (sessao.numero ?? "")}
                  </span>
                ) : (
                  <span className="diario-no diario-no--mini" />
                )}
                <button
                  type="button"
                  className={`diario-marco-titulo${sessao ? "" : " diario-marco-titulo--entre"}`}
                  onClick={() => setManual((m) => ({ ...m, [s.id]: !aberto }))}
                  aria-expanded={aberto}
                  disabled={filtrando}
                >
                  <i className={`fas fa-chevron-${aberto ? "down" : "right"}`} />
                  <b>{sessao ? rotuloSessao(sessao) : s.rotulo}</b>
                </button>
                {sessao?.ativa && <span className="diario-ao-vivo">ao vivo</span>}
                {sessao && <span className="diario-marco-data">{new Date(sessao.iniciadaEm).toLocaleDateString("pt-BR")}</span>}
                <span className="diario-marco-qtd">
                  {itens.length} {itens.length === 1 ? "item" : "itens"}
                </span>
                {ehNarrador && sessao && (
                  <button type="button" className="diario-btn" onClick={() => setNomeando(nomeando === sessao.id ? null : sessao.id)}>
                    <i className="fas fa-pen" /> Nomear
                  </button>
                )}
              </div>

              {nomeando === sessao?.id && sessao && (
                <NomearSessao
                  mesaId={mesaId}
                  sessao={sessao}
                  aoFechar={() => setNomeando(null)}
                  aoSalvar={() => {
                    setNomeando(null);
                    atualizar();
                  }}
                />
              )}

              {aberto && (
                <div className="diario-grade">
                  {itens.map((it) =>
                    it.k === "ficha" ? (
                      <CardFicha
                        key={`f-${it.id}`}
                        f={it.ficha}
                        ativo={gaveta !== null && "id" in gaveta && gaveta.id === it.id}
                        autor={ehNarrador ? nomeAutor(it.ficha.autorId) : null}
                        aoAbrir={() => setGaveta({ m: "ficha", id: it.id })}
                      />
                    ) : (
                      <CardNota
                        key={`n-${it.id}`}
                        n={it.nota}
                        ativo={gaveta !== null && "id" in gaveta && gaveta.id === it.id}
                        autor={ehNarrador || it.nota.autorId !== meuId ? nomeAutor(it.nota.autorId) : null}
                        dataJogo={calendario && it.nota.diaJogo != null ? rotuloDia(it.nota.diaJogo, calendario.config) : null}
                        aoAbrir={() => setGaveta({ m: "nota", id: it.id })}
                      />
                    ),
                  )}
                  {!filtrando && sessao && (
                    <button type="button" className="diario-adicionar" onClick={() => setGaveta({ m: "novaNota", sessaoId: sessao.id })}>
                      <i className="fas fa-plus" /> Anotar nesta sessão
                    </button>
                  )}
                  {!filtrando && !sessao && itens.length > 0 && (
                    <button type="button" className="diario-adicionar" onClick={() => setGaveta({ m: "novaNota", sessaoId: null })}>
                      <i className="fas fa-plus" /> Anotar aqui
                    </button>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
      )}

      {!somenteLeitura && (
      <CapturaRapida
        mesaId={mesaId}
        meuId={meuId}
        refs={refsOpcoes}
        contexto={contexto}
        rotuloSessao={sessaoAtiva ? rotuloSessao(sessaoAtiva) : "Entre sessões"}
        aberta={capturando}
        atalho={atalho}
        teclaN
        aoAbrir={abrirCaptura}
        aoFechar={fecharCaptura}
        aoSalvou={atualizar}
      />
      )}

      {gaveta && (
        <>
          <div className="diario-fundo" onClick={() => setGaveta(null)} aria-hidden />
          <aside className="diario-gaveta" role="dialog" aria-label="Detalhe do diário">
            <div className="diario-gaveta-topo">
              <button type="button" className="diario-btn" onClick={() => setGaveta(null)} aria-label="Fechar painel">
                <i className="fas fa-xmark" /> Fechar
              </button>
            </div>
            {gaveta.m === "ficha" && (
              <FichaDetalhe
                mesaId={mesaId}
                meuId={meuId}
                ficha={fichaDe(gaveta.id)}
                notas={notas}
                sessoes={sessoes}
                fichas={fichas}
                mencoes={mencoes}
                contexto={contexto}
                nomeAutor={nomeAutor}
                mostrarAutor={ehNarrador}
                aoEditarFicha={(f) => setGaveta({ m: "editFicha", id: f.id })}
                aoEditarNota={(n) => setGaveta({ m: "editNota", id: n.id })}
                aoMudou={() => {
                  setGaveta(null);
                  atualizar();
                }}
                aoAtualizar={atualizar}
                aoAbrirFicha={(id) => {
                  setGaveta({ m: "ficha", id });
                  atualizar();
                }}
                ehNarrador={ehNarrador}
                membros={membros}
                somenteLeitura={somenteLeitura}
              />
            )}
            {gaveta.m === "nota" &&
              (() => {
                const n = notaDe(gaveta.id);
                if (!n) return <p className="diario-vazio">Anotação não encontrada.</p>;
                const sessao = sessoes.find((s) => s.id === n.sessaoId);
                return (
                  <>
                    <h2>{sessao ? rotuloSessao(sessao) : "Entre sessões"}</h2>
                    <NotaCard
                      nota={n}
                      contexto={contexto}
                      autor={ehNarrador || n.autorId !== meuId ? nomeAutor(n.autorId) : null}
                      dataJogo={calendario && n.diaJogo != null ? rotuloDia(n.diaJogo, calendario.config) : null}
                      podeEditar={!somenteLeitura && n.autorId === meuId}
                      aoEditar={() => setGaveta({ m: "editNota", id: n.id })}
                      aoApagar={() => void apagarNota(n.id)}
                      aoAlternarVisibilidade={!somenteLeitura && n.autorId === meuId ? () => void alternarVisibilidadeNota(mesaId, n, atualizar) : undefined}
                    />
                  </>
                );
              })()}
            {gaveta.m === "editFicha" && (
              <FichaForm
                key={gaveta.id}
                mesaId={mesaId}
                meuId={meuId}
                inicial={fichaDe(gaveta.id)}
                refs={refsOpcoes}
                contexto={contexto}
                aoFechar={() => setGaveta({ m: "ficha", id: gaveta.id })}
                aoSalvar={() => {
                  setGaveta({ m: "ficha", id: gaveta.id });
                  atualizar();
                }}
              />
            )}
            {gaveta.m === "novaFicha" && (
              <FichaForm
                mesaId={mesaId}
                meuId={meuId}
                inicial={null}
                refs={refsOpcoes}
                contexto={contexto}
                aoFechar={() => setGaveta(null)}
                aoSalvar={(id) => {
                  setGaveta(id ? { m: "ficha", id } : null);
                  atualizar();
                }}
              />
            )}
            {(gaveta.m === "editNota" || gaveta.m === "novaNota") && (
              <NotaForm
                key={gaveta.m === "editNota" ? gaveta.id : "nova"}
                mesaId={mesaId}
                meuId={meuId}
                inicial={gaveta.m === "editNota" ? notaDe(gaveta.id) : null}
                sessaoPadrao={gaveta.m === "novaNota" ? gaveta.sessaoId : null}
                sessoes={sessoes}
                refs={refsOpcoes}
                contexto={contexto}
                aoFechar={() => setGaveta(null)}
                aoSalvar={() => {
                  setGaveta(null);
                  atualizar();
                }}
              />
            )}
          </aside>
        </>
      )}
    </>
  );
}

/* ─── Cards ──────────────────────────────────────────────── */

function CardFicha({ f, ativo, autor, aoAbrir }: { f: FichaDiarioDTO; ativo: boolean; autor: string | null; aoAbrir: () => void }) {
  const tipo = TIPOS_FICHA.find((t) => t.id === f.tipo);
  const resumo = resumoUmaLinha(f.resumo, 90);
  return (
    <button type="button" className={`diario-card${ativo ? " diario-card--ativo" : ""}`} onClick={aoAbrir}>
      <span className="diario-card-topo" style={{ background: tipo?.cor }}>
        {f.retratoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={f.retratoUrl} alt="" />
        ) : (
          <i className={`fas ${iconeDoTipo(f.tipo)}`} />
        )}
      </span>
      <span className="diario-card-corpo">
        <span className="diario-card-nome">
          {f.nome}
          {f.visibilidade === "publica" && <i className="fas fa-earth-americas diario-card-publica" title="Pública" />}
        </span>
        {resumo && <span className="diario-card-resumo">{resumo}</span>}
        <span className="diario-chips">
          {f.campos.relacao && <span className="diario-chip">{f.campos.relacao}</span>}
          {f.campos.status && <span className="diario-chip">{f.campos.status}</span>}
          {autor && <span className="diario-chip">{autor}</span>}
        </span>
      </span>
    </button>
  );
}

function CardNota({
  n,
  ativo,
  autor,
  dataJogo,
  aoAbrir,
}: {
  n: NotaDiarioDTO;
  ativo: boolean;
  autor: string | null;
  dataJogo: string | null;
  aoAbrir: () => void;
}) {
  const miniatura = imagensDeRica(n.corpo)[0];
  const hora = new Date(n.criadaEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return (
    <button
      type="button"
      className={`diario-postit${n.importante ? " diario-postit--importante" : ""}${ativo ? " diario-card--ativo" : ""}`}
      onClick={aoAbrir}
    >
      <span className="diario-postit-meta">
        {n.importante && <i className="fas fa-star" />} {hora}
        {n.visibilidade === "publica" && <i className="fas fa-earth-americas diario-card-publica" title="Pública" />}
        {autor ? ` · ${autor}` : ""}
        {dataJogo ? ` · ${dataJogo}` : ""}
      </span>
      {n.titulo && <span className="diario-postit-titulo">{n.titulo}</span>}
      <span className="diario-postit-texto">{resumoUmaLinha(n.corpo, 140) || (miniatura ? "" : "(vazia)")}</span>
      {miniatura && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="diario-postit-img" src={miniatura.url} alt={miniatura.legenda} loading="lazy" />
      )}
      {n.tags.length > 0 && (
        <span className="diario-chips">
          {n.tags.map((t) => (
            <span key={t} className="diario-chip">
              #{t}
            </span>
          ))}
        </span>
      )}
    </button>
  );
}
