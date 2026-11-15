"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { imagensDeRica, textoPuroRico, type TipoRef } from "@/lib/descricao-rica";
import {
  TIPOS_FICHA,
  rotuloSessao,
  rotuloDia,
  type CalendarioDiarioDTO,
  type FichaDiarioDTO,
  type MarcoDiarioDTO,
  type MencaoDiarioDTO,
  type RelacaoDTO,
  type NotaDiarioDTO,
  type NotaWikiDTO,
  type SessaoDiarioDTO,
  type TipoFichaDiario,
} from "@/lib/diario-tipos";
import { montarLinha, type ItemLinha, type SecaoLinha } from "@/lib/diario-linha";
import { montarConfigMencao, montarInfoMencao } from "@/lib/diario-mencao";
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
import { apagarNotaDiario, apagarVariosDiario } from "./actions";
import { podeApagarDiario } from "@/lib/diario-permissao";
import { CapturaRapida } from "./captura-rapida";
import { DiarioAoVivo } from "./ao-vivo";
import { Caderno } from "./caderno";
import { PublicarDialogo, Wiki } from "./wiki";
import { Quadros } from "./quadros";
import type { QuadroResumoDTO } from "@/lib/diario-quadro-tipos";
import { exigir } from "@/lib/acoes";

type Props = {
  mesaId: string;
  meuId: string;
  ehNarrador: boolean;
  fichas: FichaDiarioDTO[];
  notas: NotaDiarioDTO[];
  // Anotações que os autores marcaram pra aparecer nas páginas da wiki.
  notasWiki?: NotaWikiDTO[];
  sessoes: SessaoDiarioDTO[];
  mencoes: MencaoDiarioDTO[];
  relacoes: RelacaoDTO[];
  marcos: MarcoDiarioDTO[];
  autores: Record<string, string>;
  calendario: CalendarioDiarioDTO | null;
  // Quadros de investigação (terceira área). Sem isto, a área não aparece (ex.: aba Diário da ficha).
  quadros?: QuadroResumoDTO[];
  // Área com que a tela abre (voltando de um quadro, abre em "quadros").
  areaInicial?: "quadros";
  // Escopo com que a tela abre (a aba da ficha abre no "Meu diário").
  escopoInicial?: Escopo;
  // Atalho Ctrl+J / N neste componente. Desligue onde já há um atalho global.
  atalho?: boolean;
  // Só leitura (narrador vendo o diário de um jogador): sem criar, editar nem publicar.
  somenteLeitura?: boolean;
  avisoLeitura?: string;
};

type Modo = "linha" | "caderno" | "wiki" | "quadros";
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
  notasWiki = [],
  sessoes,
  mencoes,
  relacoes,
  marcos,
  autores,
  calendario,
  quadros,
  areaInicial,
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
  // No caderno, a página da entidade abre na folha da direita, não na gaveta.
  const [folhaId, setFolhaId] = useState<string | null>(null);
  const [novoAberto, setNovoAberto] = useState(false);
  // Seleção em massa (linha do tempo): chaves "f:id" e "n:id".
  const [selecionando, setSelecionando] = useState(false);
  const [marcados, setMarcados] = useState<string[]>([]);
  const [apagandoVarios, setApagandoVarios] = useState(false);
  // Como ler o diário: a linha do tempo ou o caderno (lembrado no aparelho).
  const [modo, setModoEstado] = useState<Modo>(areaInicial ?? "linha");
  // Página aberta na wiki, e a ficha que está no diálogo de publicar.
  const [wikiId, setWikiId] = useState<string | null>(null);
  const [publicando, setPublicando] = useState<FichaDiarioDTO | null>(null);
  const modoRef = useRef(modo);
  useEffect(() => {
    modoRef.current = modo;
  }, [modo]);
  // Cada clique no botão de modo, dentro do caderno, pede pra ele descer da tela.
  const [pedidoSair, setPedidoSair] = useState(0);
  const setModo = useCallback((m: Modo) => {
    setModoEstado(m);
    setFolhaId(null);
    // A área Quadros vai na URL (?area=quadros): voltar de um quadro reabre nela, na página do diário ou na aba da ficha.
    try {
      const url = new URL(window.location.href);
      if (m === "quadros") url.searchParams.set("area", "quadros");
      else url.searchParams.delete("area");
      window.history.replaceState(window.history.state, "", url);
    } catch {
      /* sem history: só não lembra */
    }
    // Wiki e quadros não são lembrados: o diário sempre abre no caderno (ou na linha, se foi a escolha).
    if (m === "wiki" || m === "quadros") return;
    try {
      window.localStorage.setItem("rpgo:diario:modo", m);
    } catch {
      /* sem storage: só não lembra */
    }
  }, []);
  useEffect(() => {
    if (areaInicial) return;
    const t = window.setTimeout(() => {
      // Vindo de um cartão do quadro (?abrir=): o efeito mais abaixo abre o destino.
      if (new URLSearchParams(window.location.search).get("abrir")) return;
      if (quadros && new URLSearchParams(window.location.search).get("area") === "quadros") {
        setModoEstado("quadros");
        return;
      }
      try {
        // O diário pessoal abre como caderno; a linha do tempo só quem a escolheu.
        if (window.localStorage.getItem("rpgo:diario:modo") !== "linha") setModoEstado("caderno");
      } catch {
        /* sem storage: fica na linha do tempo */
      }
    }, 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só na montagem
  }, [areaInicial]);
  const [capturando, setCapturando] = useState(false);
  const abrirCaptura = useCallback(() => setCapturando(true), []);
  const fecharCaptura = useCallback(() => setCapturando(false), []);
  const [nomeando, setNomeando] = useState<string | null>(null);
  // Seções que a pessoa abriu ou fechou à mão (o resto segue o padrão).
  const [manual, setManual] = useState<Record<string, boolean>>({});

  // Link de fora do diário (um cartão do quadro): abre a página, a anotação ou a sessão e limpa a URL.
  function abrirDeFora(alvo: string) {
    const [tipo, id] = alvo.split(":");
    const url = new URL(window.location.href);
    url.searchParams.delete("abrir");
    window.history.replaceState(window.history.state, "", url);
    if (!id) return;
    if (tipo === "ficha") {
      const f = fichas.find((x) => x.id === id);
      if (!f) return;
      // Página pública ou oculta vive na wiki; a privada é a minha folha do caderno.
      if (f.visibilidade === "privada") {
        setModoEstado("caderno");
        setFolhaId(id);
      } else {
        setModoEstado("wiki");
        setWikiId(id);
      }
    } else if (tipo === "nota") {
      setModoEstado("caderno");
      setGaveta({ m: "nota", id });
    } else if (tipo === "sessao") {
      setModoEstado("linha");
      setManual((m) => ({ ...m, [`sessao-${id}`]: true }));
      window.setTimeout(() => document.getElementById(`sessao-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
    }
  }
  useEffect(() => {
    const t = window.setTimeout(() => {
      const abrir = new URLSearchParams(window.location.search).get("abrir");
      if (abrir) abrirDeFora(abrir);
    }, 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só na montagem
  }, []);

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
      if (modoRef.current === "caderno") setFolhaId(id);
      else if (modoRef.current === "wiki") setWikiId(id);
      else setGaveta({ m: "ficha", id });
    } else if (tipo === "dia" || tipo === "evento") {
      // O calendário da mesa tem página própria.
      router.push(`/calendario/${mesaId}`);
    } else if (tipo === "sessao") {
      setGaveta(null);
      setManual((m) => ({ ...m, [`sessao-${id}`]: true }));
      window.setTimeout(() => document.getElementById(`sessao-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    }
  }, [router, mesaId]);

  // O que o `@` e o `[[ ]]` oferecem, e como cada menção é destacada no texto.
  const cfg = useMemo(() => montarConfigMencao(fichas, sessoes, calendario), [fichas, sessoes, calendario]);
  const contexto = useMemo<ContextoRico>(
    () => ({
      refs: montarInfoMencao(fichas, sessoes, calendario, marcos),
      aoAbrirRef: abrirRef,
      ...(calendario ? { calendario: { config: calendario.config, hoje: calendario.hoje } } : {}),
    }),
    [fichas, sessoes, calendario, marcos, abrirRef],
  );

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

  const acessoMeu = useMemo(() => ({ userId: meuId, narrador: ehNarrador }), [meuId, ehNarrador]);
  const podeApagarItem = useCallback(
    (it: ItemLinha) => !somenteLeitura && podeApagarDiario(acessoMeu, it.k === "ficha" ? it.ficha : it.nota),
    [acessoMeu, somenteLeitura],
  );
  const chaveDe = (it: ItemLinha) => (it.k === "ficha" ? `f:${it.id}` : `n:${it.id}`);
  const alternarMarca = (chave: string) => setMarcados((m) => (m.includes(chave) ? m.filter((x) => x !== chave) : [...m, chave]));
  const sairDaSelecao = () => {
    setSelecionando(false);
    setMarcados([]);
  };

  async function apagarMarcados() {
    if (marcados.length === 0 || apagandoVarios) return;
    const n = marcados.length;
    if (!(await confirmar(`Apagar ${n} ${n === 1 ? "item" : "itens"}? Isso não pode ser desfeito.`))) return;
    setApagandoVarios(true);
    try {
      const r = exigir(
        await apagarVariosDiario(
          mesaId,
          marcados.filter((c) => c.startsWith("f:")).map((c) => c.slice(2)),
          marcados.filter((c) => c.startsWith("n:")).map((c) => c.slice(2)),
        ),
      );
      setGaveta(null);
      sairDaSelecao();
      atualizar();
      if (r.ignoradas > 0) avisar(`${r.ignoradas} ${r.ignoradas === 1 ? "item não pôde" : "itens não puderam"} ser apagado${r.ignoradas === 1 ? "" : "s"} (página de personagem da mesa, ou sem permissão).`);
    } catch (e) {
      avisar(e instanceof Error ? e.message : "Falha ao apagar.");
    } finally {
      setApagandoVarios(false);
    }
  }

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
          aria-pressed={modo === "linha" || modo === "caderno"}
          onClick={() => (modo === "linha" || modo === "wiki" || modo === "quadros" ? setModo("caderno") : setPedidoSair((n) => n + 1))}
          title={modo === "linha" ? "Ler como caderno" : "Ler como linha do tempo"}
        >
          <i className={`fas ${modo === "linha" ? "fa-timeline" : "fa-book"}`} /> {modo === "linha" ? "Linha do tempo" : "Meu caderno"}{" "}
          {(modo === "linha" || modo === "caderno") && <i className="fas fa-repeat" aria-hidden />}
        </button>
        <button type="button" className="diario-aba" aria-pressed={modo === "wiki"} onClick={() => setModo("wiki")}>
          <i className="fas fa-earth-americas" /> Wiki da mesa
        </button>
        {quadros && (
          <button type="button" className="diario-aba" aria-pressed={modo === "quadros"} onClick={() => setModo("quadros")}>
            <i className="fas fa-diagram-project" /> Quadros
          </button>
        )}
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
          <button type="button" className="diario-btn" aria-pressed={selecionando} onClick={() => (selecionando ? sairDaSelecao() : setSelecionando(true))}>
            <i className="fas fa-square-check" /> {selecionando ? "Cancelar seleção" : "Selecionar"}
          </button>
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

        {selecionando && (
          <div className="diario-selecao">
            <span>
              <b>{marcados.length}</b> {marcados.length === 1 ? "selecionado" : "selecionados"}
            </span>
            <button
              type="button"
              className="diario-btn"
              onClick={() =>
                setMarcados(visiveis.flatMap(({ itens }) => itens.filter(podeApagarItem).map(chaveDe)))
              }
            >
              Selecionar tudo o que aparece
            </button>
            <button type="button" className="diario-btn" onClick={() => setMarcados([])} disabled={marcados.length === 0}>
              Limpar
            </button>
            <button type="button" className="diario-btn diario-btn--perigo" onClick={() => void apagarMarcados()} disabled={marcados.length === 0 || apagandoVarios}>
              <i className="fas fa-trash" /> Apagar {marcados.length > 0 ? `(${marcados.length})` : ""}
            </button>
          </div>
        )}
        </>
      )}

      {modo !== "wiki" && modo !== "quadros" && (
      <p className="diario-aviso">
        <i className="fas fa-eye" />{" "}
        {avisoLeitura ??
          (ehNarrador
          ? "Você vê o diário de todos os jogadores."
          : "Suas anotações são privadas, mas o narrador também pode lê-las.")}
      </p>
      )}

      {modo === "quadros" && quadros ? (
        <Quadros mesaId={mesaId} meuId={meuId} quadros={quadros} autores={autores} somenteLeitura={somenteLeitura} />
      ) : modo === "wiki" ? (
        <Wiki
          mesaId={mesaId}
          meuId={meuId}
          ehNarrador={ehNarrador}
          somenteLeitura={somenteLeitura}
          fichas={fichas}
          notas={notas}
          notasWiki={notasWiki}
          sessoes={sessoes}
          mencoes={mencoes}
          relacoes={relacoes}
          autores={autores}
          participantes={membros}
          contexto={contexto}
          refs={refsOpcoes}
          cfg={cfg}
          abertaId={wikiId}
          aoAbrir={setWikiId}
          aoNovaPagina={() => setGaveta({ m: "novaFicha" })}
          aoEditar={(id) => setGaveta({ m: "editFicha", id })}
          aoAbrirNoCaderno={(id) => {
            setModo("caderno");
            setFolhaId(id);
          }}
          aoAtualizar={atualizar}
        />
      ) : modo === "caderno" ? (
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
          cfg={cfg}
          mencoes={mencoes}
          relacoes={relacoes}
          folhaId={folhaId}
          somenteLeitura={somenteLeitura}
          aoAbrirFicha={setFolhaId}
          aoFecharFolha={() => setFolhaId(null)}
          aoAbrirCompleta={(id) => setGaveta({ m: "ficha", id })}
          aoVerNaWiki={(id) => {
            setModo("wiki");
            setWikiId(id);
          }}
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
                        selecao={selecionando ? { marcado: marcados.includes(chaveDe(it)), bloqueado: !podeApagarItem(it) } : undefined}
                        aoAbrir={() => (selecionando ? podeApagarItem(it) && alternarMarca(chaveDe(it)) : setGaveta({ m: "ficha", id: it.id }))}
                      />
                    ) : (
                      <CardNota
                        key={`n-${it.id}`}
                        n={it.nota}
                        ativo={gaveta !== null && "id" in gaveta && gaveta.id === it.id}
                        autor={ehNarrador || it.nota.autorId !== meuId ? nomeAutor(it.nota.autorId) : null}
                        dataJogo={calendario && it.nota.diaJogo != null ? rotuloDia(it.nota.diaJogo, calendario.config) : null}
                        selecao={selecionando ? { marcado: marcados.includes(chaveDe(it)), bloqueado: !podeApagarItem(it) } : undefined}
                        aoAbrir={() => (selecionando ? podeApagarItem(it) && alternarMarca(chaveDe(it)) : setGaveta({ m: "nota", id: it.id }))}
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
        cfg={cfg}
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
                relacoes={relacoes}
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
                aoPublicar={setPublicando}
                aoVerNaWiki={(id) => {
                  setGaveta(null);
                  setModo("wiki");
                  setWikiId(id);
                }}
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
                cfg={cfg}
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
                cfg={cfg}
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
                cfg={cfg}
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

      {publicando && (
        <PublicarDialogo
          mesaId={mesaId}
          meuId={meuId}
          ficha={publicando}
          fichas={fichas}
          notas={notas}
          mencoes={mencoes}
          sessoes={sessoes}
          ehNarrador={ehNarrador}
          aoFechar={() => setPublicando(null)}
          aoMudou={(abrirId) => {
            setPublicando(null);
            if (abrirId) setGaveta({ m: "ficha", id: abrirId });
            atualizar();
          }}
        />
      )}
    </>
  );
}

/* ─── Cards ──────────────────────────────────────────────── */

type SelecaoCard = { marcado: boolean; bloqueado: boolean };

// A caixinha que aparece no canto do card quando se está selecionando.
function Marca({ s }: { s: SelecaoCard }) {
  return (
    <span className={`diario-marca${s.marcado ? " on" : ""}${s.bloqueado ? " off" : ""}`} aria-hidden>
      {s.marcado && <i className="fas fa-check" />}
    </span>
  );
}

function CardFicha({
  f,
  ativo,
  autor,
  selecao,
  aoAbrir,
}: {
  f: FichaDiarioDTO;
  ativo: boolean;
  autor: string | null;
  selecao?: SelecaoCard;
  aoAbrir: () => void;
}) {
  const tipo = TIPOS_FICHA.find((t) => t.id === f.tipo);
  const resumo = resumoUmaLinha(f.resumo, 90);
  return (
    <button
      type="button"
      className={`diario-card${ativo ? " diario-card--ativo" : ""}${selecao?.marcado ? " diario-card--marcado" : ""}`}
      onClick={aoAbrir}
      aria-pressed={selecao ? selecao.marcado : undefined}
      disabled={selecao?.bloqueado}
    >
      {selecao && <Marca s={selecao} />}
      <span className="diario-card-topo" style={{ background: tipo?.cor }}>
        {f.retratos[0]?.url || f.retratoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={f.retratos[0]?.url ?? f.retratoUrl ?? ""} alt="" />
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
  selecao,
  aoAbrir,
}: {
  n: NotaDiarioDTO;
  ativo: boolean;
  autor: string | null;
  dataJogo: string | null;
  selecao?: SelecaoCard;
  aoAbrir: () => void;
}) {
  const miniatura = imagensDeRica(n.corpo)[0];
  const hora = new Date(n.criadaEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return (
    <button
      type="button"
      className={`diario-postit${n.importante ? " diario-postit--importante" : ""}${ativo ? " diario-card--ativo" : ""}${selecao?.marcado ? " diario-card--marcado" : ""}`}
      onClick={aoAbrir}
      aria-pressed={selecao ? selecao.marcado : undefined}
      disabled={selecao?.bloqueado}
    >
      {selecao && <Marca s={selecao} />}
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
