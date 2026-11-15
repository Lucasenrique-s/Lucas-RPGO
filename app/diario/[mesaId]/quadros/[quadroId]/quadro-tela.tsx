"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type EdgeTypes,
  type FinalConnectionState,
  type NodeChange,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { exigir, type Resultado } from "@/lib/acoes";
import { acharLugarLivre, ajustarImagem, dentroDaMoldura, extrairUrl, pareceImagem, type Retangulo } from "@/lib/diario-quadro-geo";
import {
  LIMITES_QUADRO,
  TAMANHO_PADRAO,
  type CartaoDTO,
  type ConteudoQuadroDTO,
  type CorCartao,
  type LigacaoDTO,
  type TipoCartao,
} from "@/lib/diario-quadro-tipos";
import type { QuadroAbertoDTO } from "@/lib/diario-quadros";
import { BotaoVoltar } from "@/components/botao-voltar";
import {
  apagarCartoesQuadro,
  apagarLigacaoQuadro,
  atualizarCartoesQuadro,
  atualizarLigacaoQuadro,
  criarCartoesQuadro,
  criarLigacaoQuadro,
  type DadosLigacao,
  type MudancaCartao,
  type NovoCartao,
} from "../../quadro-acoes";
import { renomearQuadroDiario } from "../../quadros-actions";
import { avisar, enviarImagem } from "../../diario-partes";
import { QuadroContexto, type ArestaLigacao, type CtxQuadro, type FormatoTexto, type NoCartao } from "./quadro-contexto";
import { ImagemNo, MolduraNo, NotaNo, PaginaNo, PostitNo, SessaoNo, TextoSoltoNo } from "./quadro-nos";
import { BarbanteAresta } from "./quadro-aresta";
import { Gaveta, TIPO_ARRASTE, type AbaGaveta, type ItemArrastado } from "./quadro-gaveta";
import { BuscaPagina } from "./quadro-busca";
import "./quadro.css";

// Fora do componente: referências estáveis (o React Flow compara por identidade).
const TIPOS_NO: NodeTypes = {
  postit: PostitNo,
  pagina: PaginaNo,
  nota: NotaNo,
  sessao: SessaoNo,
  imagem: ImagemNo,
  moldura: MolduraNo,
  texto: TextoSoltoNo,
};
const TIPOS_ARESTA: EdgeTypes = { barbante: BarbanteAresta };

const COR_MINIMAPA: Record<CorCartao, string> = {
  amarelo: "var(--color-bonus)",
  rosa: "var(--danger)",
  verde: "var(--color-success)",
  azul: "var(--info)",
  laranja: "var(--color-power)",
  roxo: "var(--color-livre)",
  cinza: "var(--text-sec)",
};

const noDe = (c: CartaoDTO, podeEditar: boolean): NoCartao => ({
  id: c.id,
  type: c.tipo,
  position: { x: c.x, y: c.y },
  // Tamanho por estilo (não por width/height): assim o React Flow mede o nó e acha as alças, que o barbante precisa.
  style: { width: c.largura, height: c.altura },
  // A moldura fica atrás de tudo (inclusive do barbante).
  zIndex: c.tipo === "moldura" ? -1 : undefined,
  draggable: podeEditar,
  data: { cartao: c },
});

const arestaDe = (l: LigacaoDTO): ArestaLigacao => ({
  id: l.id,
  source: l.deId,
  target: l.paraId,
  type: "barbante",
  data: { ligacao: l },
});

const rectDe = (n: NoCartao): Retangulo => ({
  x: n.position.x,
  y: n.position.y,
  largura: n.width ?? n.measured?.width ?? n.data.cartao.largura,
  altura: n.height ?? n.measured?.height ?? n.data.cartao.altura,
});

// O cartão como está agora no canvas (posição e tamanho vêm do nó).
const cartaoAtual = (n: NoCartao): CartaoDTO => ({ ...n.data.cartao, ...rectDe(n) });

const digitando = (alvo: EventTarget | null) =>
  alvo instanceof HTMLElement && (alvo.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(alvo.tagName));

// O quadro em tela cheia.
export function QuadroTela({ mesaId, quadro, conteudo }: { mesaId: string; quadro: QuadroAbertoDTO; conteudo: ConteudoQuadroDTO }) {
  return (
    <div className="qt">
      <ReactFlowProvider>
        <Canvas mesaId={mesaId} quadro={quadro} conteudo={conteudo} />
      </ReactFlowProvider>
    </div>
  );
}

function Canvas({ mesaId, quadro, conteudo }: { mesaId: string; quadro: QuadroAbertoDTO; conteudo: ConteudoQuadroDTO }) {
  const router = useRouter();
  const rf = useReactFlow<NoCartao, ArestaLigacao>();
  const podeEditar = quadro.permissoes.editar;
  const meuId = quadro.meuId;

  // O estado nasce do servidor e daí em diante o navegador é quem manda (o tempo real entra depois).
  const [nos, setNos] = useState<NoCartao[]>(() => conteudo.cartoes.map((c) => noDe(c, podeEditar)));
  const [arestas, setArestas] = useState<ArestaLigacao[]>(() => conteudo.ligacoes.map(arestaDe));
  const [editandoId, setEditando] = useState<string | null>(null);
  const [ultimaCor, setUltimaCor] = useState<CorCartao>("amarelo");
  const [gavetaAberta, setGavetaAberta] = useState(false);
  const [abaGaveta, setAbaGaveta] = useState<AbaGaveta>("paginas");
  const [buscando, setBuscando] = useState(false);
  const [ligar, setLigar] = useState(false);
  const [ligandoDe, setLigandoDe] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(0);
  const [toque, setToque] = useState(false);
  const area = useRef<HTMLDivElement>(null);
  const arquivo = useRef<HTMLInputElement>(null);

  const paginas = useMemo(() => new Map(conteudo.paginas.map((p) => [p.id, p])), [conteudo.paginas]);
  const notas = useMemo(() => new Map(conteudo.notas.map((n) => [n.id, n])), [conteudo.notas]);
  const sessoes = useMemo(() => new Map(conteudo.sessoes.map((s) => [s.id, s])), [conteudo.sessoes]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setGavetaAberta(window.innerWidth >= 900);
      setToque(window.matchMedia("(pointer: coarse)").matches);
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  // ─── Salvar: uma fila só, na ordem (criar antes de editar o mesmo cartão) ───
  const fila = useRef<Promise<void>>(Promise.resolve());
  const enfileirar = useCallback((fn: () => Promise<Resultado<object>>) => {
    fila.current = fila.current.then(async () => {
      try {
        exigir(await fn());
      } catch (e) {
        avisar(e instanceof Error ? e.message : "Não foi possível salvar. Recarregue o quadro.");
      }
    });
  }, []);

  const persistirMudancas = useCallback(
    (m: MudancaCartao[]) => {
      if (m.length > 0) enfileirar(() => atualizarCartoesQuadro(mesaId, quadro.id, m));
    },
    [enfileirar, mesaId, quadro.id],
  );

  // ─── Criar ───────────────────────────────────────────────────────────────
  const centro = useCallback(() => {
    const b = area.current?.getBoundingClientRect();
    // Com a gaveta aberta (lado a lado, não no celular), o centro é o da parte que sobra.
    const gaveta = gavetaAberta && window.innerWidth > 720 ? 302 : 0;
    return rf.screenToFlowPosition({
      x: b ? b.left + gaveta + (b.width - gaveta) / 2 : window.innerWidth / 2,
      y: b ? b.top + b.height / 2 : window.innerHeight / 2,
    });
  }, [rf, gavetaAberta]);

  const novo = useCallback(
    (tipo: TipoCartao, onde: { x: number; y: number } | null, extra: Partial<CartaoDTO> = {}): CartaoDTO => {
      const t = TAMANHO_PADRAO[tipo];
      const largura = extra.largura ?? t.largura;
      const altura = extra.altura ?? t.altura;
      let x: number;
      let y: number;
      if (onde) {
        x = onde.x - largura / 2;
        y = onde.y - altura / 2;
      } else {
        // Sem ponto escolhido: o centro da tela, mas num lugar sem cartão por perto.
        const c = centro();
        // Moldura fica atrás dos outros cartões: ela não desvia de ninguém.
        const livre = acharLugarLivre(
          { x: c.x - largura / 2, y: c.y - altura / 2, largura, altura },
          tipo === "moldura" ? [] : rf.getNodes().filter((n) => n.type !== "moldura").map(rectDe),
        );
        x = livre.x;
        y = livre.y;
      }
      return {
        id: crypto.randomUUID(),
        tipo,
        formato: "cartao",
        x: Math.round(x),
        y: Math.round(y),
        largura,
        altura,
        z: 0,
        cor: tipo === "postit" ? ultimaCor : "cinza",
        texto: "",
        // Título e texto solto nascem em negrito; a legenda da imagem, centralizada.
        fonte: null,
        alinhamento: tipo === "imagem" ? "centro" : "esquerda",
        corTexto: "padrao",
        negrito: tipo === "texto" || tipo === "moldura",
        refId: null,
        url: null,
        autorId: meuId,
        sessaoId: conteudo.sessaoAtualId,
        oculto: false,
        reveladoSessaoId: null,
        criadoEm: new Date().toISOString(),
        ...extra,
      };
    },
    [centro, rf, ultimaCor, meuId, conteudo.sessaoAtualId],
  );

  const paraNovo = (c: CartaoDTO): NovoCartao => ({
    id: c.id,
    tipo: c.tipo,
    x: c.x,
    y: c.y,
    largura: c.largura,
    altura: c.altura,
    cor: c.cor,
    texto: c.texto,
    fonte: c.fonte,
    alinhamento: c.alinhamento,
    corTexto: c.corTexto,
    negrito: c.negrito,
    refId: c.refId,
    url: c.url,
    formato: c.formato,
  });

  const adicionar = useCallback(
    (cs: CartaoDTO[], ligacoes: LigacaoDTO[] = []) => {
      if (!podeEditar || cs.length === 0) return;
      if (nos.length + cs.length > LIMITES_QUADRO.cartoes) {
        avisar(`O quadro chegou a ${LIMITES_QUADRO.cartoes} cartões.`);
        return;
      }
      setNos((ns) => [...ns.map((n) => ({ ...n, selected: false })), ...cs.map((c) => ({ ...noDe(c, podeEditar), selected: true }))]);
      setArestas((es) => [...es.map((e) => ({ ...e, selected: false })), ...ligacoes.map(arestaDe)]);
      enfileirar(() => criarCartoesQuadro(mesaId, quadro.id, cs.map(paraNovo)));
      for (const l of ligacoes) enfileirar(() => criarLigacaoQuadro(mesaId, quadro.id, l.id, l.deId, l.paraId, { rotulo: l.rotulo, cor: l.cor, traco: l.traco, seta: l.seta }));
    },
    [podeEditar, nos.length, enfileirar, mesaId, quadro.id],
  );

  const criarTexto = useCallback(
    (tipo: "postit" | "moldura" | "texto", onde: { x: number; y: number } | null = null) => {
      const c = novo(tipo, onde);
      adicionar([c]);
      setEditando(c.id);
    },
    [novo, adicionar],
  );

  const criarReferencia = useCallback(
    (item: ItemArrastado, onde: { x: number; y: number } | null = null) => {
      adicionar([novo(item.tipo, onde, { refId: item.refId })]);
    },
    [novo, adicionar],
  );

  const criarImagemPorUrl = useCallback(
    (url: string, onde: { x: number; y: number } | null = null) => {
      const img = new Image();
      img.onload = () => {
        const t = ajustarImagem(img.naturalWidth, img.naturalHeight);
        adicionar([novo("imagem", onde, { url, ...t })]);
      };
      img.onerror = () => avisar("Não foi possível carregar essa imagem.");
      img.src = url;
    },
    [novo, adicionar],
  );

  const enviarArquivos = useCallback(
    async (arquivos: File[], onde: { x: number; y: number } | null = null) => {
      for (const f of arquivos.filter((a) => a.type.startsWith("image/"))) {
        setEnviando((n) => n + 1);
        try {
          criarImagemPorUrl(await enviarImagem(mesaId, meuId, f), onde);
        } catch (e) {
          avisar(e instanceof Error ? e.message : "Falha ao enviar a imagem.");
        } finally {
          setEnviando((n) => n - 1);
        }
      }
    },
    [mesaId, meuId, criarImagemPorUrl],
  );

  // ─── Editar ──────────────────────────────────────────────────────────────
  const salvarTexto = useCallback(
    (id: string, texto: string) => {
      const atual = rf.getNode(id);
      if (!atual || atual.data.cartao.texto === texto) return;
      setNos((ns) => ns.map((n) => (n.id === id ? { ...n, data: { cartao: { ...n.data.cartao, texto } } } : n)));
      persistirMudancas([{ id, texto }]);
    },
    [rf, persistirMudancas],
  );

  const salvarTamanho = useCallback(
    (id: string, g: { x: number; y: number; largura: number; altura: number }) => persistirMudancas([{ id, ...g }]),
    [persistirMudancas],
  );

  const mudarCor = useCallback(
    (ids: string[], cor: CorCartao) => {
      const s = new Set(ids);
      setNos((ns) => ns.map((n) => (s.has(n.id) ? { ...n, data: { cartao: { ...n.data.cartao, cor } } } : n)));
      setUltimaCor(cor);
      persistirMudancas(ids.map((id) => ({ id, cor })));
    },
    [persistirMudancas],
  );

  const formatar = useCallback(
    (ids: string[], f: FormatoTexto) => {
      const s = new Set(ids);
      setNos((ns) => ns.map((n) => (s.has(n.id) ? { ...n, data: { cartao: { ...n.data.cartao, ...f } } } : n)));
      persistirMudancas(ids.map((id) => ({ id, ...f })));
    },
    [persistirMudancas],
  );

  const apagar = useCallback(
    (ids: string[]) => {
      if (!podeEditar || ids.length === 0) return;
      const s = new Set(ids);
      setNos((ns) => ns.filter((n) => !s.has(n.id)));
      setArestas((es) => es.filter((e) => !s.has(e.source) && !s.has(e.target)));
      setEditando(null);
      enfileirar(() => apagarCartoesQuadro(mesaId, quadro.id, ids));
    },
    [podeEditar, enfileirar, mesaId, quadro.id],
  );

  const duplicar = useCallback(
    (ids: string[]) => {
      if (!podeEditar) return;
      const s = new Set(ids);
      const origem = rf.getNodes().filter((n) => s.has(n.id));
      if (origem.length === 0) return;
      const mapa = new Map<string, string>();
      const copias = origem.map((n) => {
        const c = cartaoAtual(n);
        const id = crypto.randomUUID();
        mapa.set(c.id, id);
        return { ...c, id, x: c.x + 32, y: c.y + 32, autorId: meuId, sessaoId: conteudo.sessaoAtualId, criadoEm: new Date().toISOString() };
      });
      const ligacoes = rf
        .getEdges()
        .filter((e) => s.has(e.source) && s.has(e.target) && e.data)
        .map((e): LigacaoDTO => ({ ...(e.data as { ligacao: LigacaoDTO }).ligacao, id: crypto.randomUUID(), deId: mapa.get(e.source) as string, paraId: mapa.get(e.target) as string, autorId: meuId }));
      adicionar(copias, ligacoes);
    },
    [podeEditar, rf, meuId, conteudo.sessaoAtualId, adicionar],
  );

  // ─── Barbante ────────────────────────────────────────────────────────────
  const novaLigacao = useCallback(
    (de: string, para: string) => {
      if (!podeEditar || de === para) return;
      const l: LigacaoDTO = { id: crypto.randomUUID(), deId: de, paraId: para, rotulo: "", cor: "cinza", traco: "continuo", seta: false, autorId: meuId, oculto: false };
      // Já nasce selecionada: a barra de edição abre pra dar rótulo e cor.
      setNos((ns) => ns.map((n) => (n.selected ? { ...n, selected: false } : n)));
      setArestas((es) => [...es.map((e) => (e.selected ? { ...e, selected: false } : e)), { ...arestaDe(l), selected: true }]);
      enfileirar(() => criarLigacaoQuadro(mesaId, quadro.id, l.id, de, para));
    },
    [podeEditar, meuId, enfileirar, mesaId, quadro.id],
  );

  const onConnect = useCallback((c: Connection) => novaLigacao(c.source, c.target), [novaLigacao]);

  // Soltar em qualquer parte de outro cartão também liga (não só em cima da alça).
  const onConnectEnd = useCallback(
    (e: MouseEvent | TouchEvent, estado: FinalConnectionState) => {
      if (estado.isValid || !estado.fromNode) return;
      const ponto = "changedTouches" in e ? e.changedTouches[0] : e;
      const id = document.elementFromPoint(ponto.clientX, ponto.clientY)?.closest(".react-flow__node")?.getAttribute("data-id");
      if (id && id !== estado.fromNode.id) novaLigacao(estado.fromNode.id, id);
    },
    [novaLigacao],
  );

  const atualizarLigacao = useCallback(
    (id: string, dados: DadosLigacao) => {
      setArestas((es) => es.map((e) => (e.id === id && e.data ? { ...e, data: { ligacao: { ...e.data.ligacao, ...dados } } } : e)));
      enfileirar(() => atualizarLigacaoQuadro(mesaId, quadro.id, id, dados));
    },
    [enfileirar, mesaId, quadro.id],
  );

  const apagarLigacao = useCallback(
    (id: string) => {
      setArestas((es) => es.filter((e) => e.id !== id));
      enfileirar(() => apagarLigacaoQuadro(mesaId, quadro.id, id));
    },
    [enfileirar, mesaId, quadro.id],
  );

  const selecionarLigacao = useCallback((id: string) => {
    setNos((ns) => ns.map((n) => (n.selected ? { ...n, selected: false } : n)));
    setArestas((es) => es.map((e) => ({ ...e, selected: e.id === id })));
  }, []);

  // ─── Mover (e levar o que está dentro da moldura) ────────────────────────
  const arrasto = useRef<{ base: { x: number; y: number }; extras: { id: string; x: number; y: number }[] } | null>(null);

  const onNodeDragStart = useCallback(
    (_: unknown, node: NoCartao, arrastados: NoCartao[]) => {
      if (node.type !== "moldura") {
        arrasto.current = null;
        return;
      }
      const ids = new Set(arrastados.map((n) => n.id));
      const m = rectDe(node);
      const extras = rf
        .getNodes()
        .filter((n) => !ids.has(n.id) && n.type !== "moldura" && dentroDaMoldura(m, rectDe(n)))
        .map((n) => ({ id: n.id, x: n.position.x, y: n.position.y }));
      arrasto.current = { base: { x: node.position.x, y: node.position.y }, extras };
    },
    [rf],
  );

  const onNodeDrag = useCallback((_: unknown, node: NoCartao) => {
    const a = arrasto.current;
    if (!a || node.type !== "moldura" || a.extras.length === 0) return;
    const dx = node.position.x - a.base.x;
    const dy = node.position.y - a.base.y;
    const porId = new Map(a.extras.map((x) => [x.id, x]));
    setNos((ns) => ns.map((n) => (porId.has(n.id) ? { ...n, position: { x: (porId.get(n.id) as { x: number }).x + dx, y: (porId.get(n.id) as { y: number }).y + dy } } : n)));
  }, []);

  const onNodeDragStop = useCallback(
    (_: unknown, node: NoCartao, arrastados: NoCartao[]) => {
      const a = arrasto.current;
      arrasto.current = null;
      const m: MudancaCartao[] = arrastados.map((n) => ({ id: n.id, x: n.position.x, y: n.position.y }));
      if (a && node.type === "moldura") {
        const dx = node.position.x - a.base.x;
        const dy = node.position.y - a.base.y;
        for (const x of a.extras) m.push({ id: x.id, x: x.x + dx, y: x.y + dy });
      }
      persistirMudancas(m);
    },
    [persistirMudancas],
  );

  const onNodesChange = useCallback((c: NodeChange<NoCartao>[]) => setNos((ns) => applyNodeChanges(c, ns)), []);
  const onEdgesChange = useCallback((c: EdgeChange<ArestaLigacao>[]) => setArestas((es) => applyEdgeChanges(c, es)), []);

  // Ferramenta "Ligação": clicar no cartão de origem e depois no de destino.
  const onNodeClick = useCallback(
    (_: unknown, node: NoCartao) => {
      if (!ligar) return;
      if (!ligandoDe) setLigandoDe(node.id);
      else {
        if (node.id !== ligandoDe) novaLigacao(ligandoDe, node.id);
        setLigandoDe(null);
        setLigar(false);
      }
    },
    [ligar, ligandoDe, novaLigacao],
  );

  const sairDaLigacao = useCallback(() => {
    setLigar(false);
    setLigandoDe(null);
  }, []);

  // ─── Atalhos, colar e soltar ─────────────────────────────────────────────
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (digitando(e.target) || buscando) return;
      if (e.key === "Escape") {
        sairDaLigacao();
        return;
      }
      if (!podeEditar) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        const ns = rf.getNodes().filter((n) => n.selected).map((n) => n.id);
        const es = rf.getEdges().filter((x) => x.selected).map((x) => x.id);
        if (ns.length > 0) apagar(ns);
        for (const id of es) apagarLigacao(id);
        if (ns.length + es.length > 0) e.preventDefault();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        const ids = rf.getNodes().filter((n) => n.selected).map((n) => n.id);
        if (ids.length > 0) {
          e.preventDefault();
          duplicar(ids);
        }
      } else if (e.key === "@") {
        e.preventDefault();
        setBuscando(true);
      }
    }
    function colar(e: ClipboardEvent) {
      if (digitando(e.target) || !podeEditar || buscando) return;
      const d = e.clipboardData;
      if (!d) return;
      const imagens = [...d.files].filter((f) => f.type.startsWith("image/"));
      if (imagens.length > 0) {
        e.preventDefault();
        void enviarArquivos(imagens);
        return;
      }
      const texto = d.getData("text/plain");
      if (!texto.trim()) return;
      e.preventDefault();
      const url = extrairUrl(texto);
      if (url && pareceImagem(url)) criarImagemPorUrl(url);
      else adicionar([novo("postit", null, { texto: texto.trim().slice(0, LIMITES_QUADRO.texto) })]);
    }
    window.addEventListener("keydown", tecla);
    window.addEventListener("paste", colar);
    return () => {
      window.removeEventListener("keydown", tecla);
      window.removeEventListener("paste", colar);
    };
  }, [podeEditar, buscando, rf, apagar, apagarLigacao, duplicar, enviarArquivos, criarImagemPorUrl, adicionar, novo, sairDaLigacao]);

  function aoSoltar(e: React.DragEvent) {
    if (!podeEditar) return;
    e.preventDefault();
    const onde = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const bruto = e.dataTransfer.getData(TIPO_ARRASTE);
    if (bruto) {
      try {
        criarReferencia(JSON.parse(bruto) as ItemArrastado, onde);
      } catch {
        /* arraste de outra coisa */
      }
      return;
    }
    const arquivos = [...e.dataTransfer.files];
    if (arquivos.length > 0) void enviarArquivos(arquivos, onde);
  }

  function aoDuploClique(e: React.MouseEvent) {
    if (!podeEditar || !(e.target instanceof HTMLElement) || !e.target.classList.contains("react-flow__pane")) return;
    criarTexto("postit", rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
  }

  function abrirGaveta(aba: AbaGaveta) {
    setAbaGaveta(aba);
    setGavetaAberta(true);
  }

  const abrirReferencia = useCallback(
    (c: CartaoDTO) => {
      if (!c.refId) return;
      const prefixo = c.tipo === "pagina" ? "ficha" : c.tipo === "nota" ? "nota" : "sessao";
      router.push(`/diario/${mesaId}?abrir=${prefixo}:${c.refId}`);
    },
    [router, mesaId],
  );

  // Marca a origem escolhida na ferramenta "Ligação".
  const nosVisiveis = useMemo(
    () => (ligandoDe ? nos.map((n) => (n.id === ligandoDe ? { ...n, className: "qn-origem" } : n)) : nos),
    [nos, ligandoDe],
  );

  const ctx = useMemo<CtxQuadro>(
    () => ({
      mesaId,
      meuId,
      podeEditar,
      autores: quadro.autores,
      paginas,
      notas,
      sessoes,
      editandoId,
      editar: setEditando,
      salvarTexto,
      salvarTamanho,
      mudarCor,
      formatar,
      apagar,
      duplicar,
      abrirReferencia,
      atualizarLigacao,
      apagarLigacao,
      selecionarLigacao,
      ligandoDe,
    }),
    [mesaId, meuId, podeEditar, quadro.autores, paginas, notas, sessoes, editandoId, salvarTexto, salvarTamanho, mudarCor, formatar, apagar, duplicar, abrirReferencia, atualizarLigacao, apagarLigacao, selecionarLigacao, ligandoDe],
  );

  return (
    <QuadroContexto.Provider value={ctx}>
      <div
        ref={area}
        className={`qt-canvas${ligar ? " qt-canvas--ligando" : ""}${gavetaAberta ? " qt-canvas--com-gaveta" : ""}`}
        onDragOver={(e) => podeEditar && e.preventDefault()}
        onDrop={aoSoltar}
        onDoubleClick={aoDuploClique}
      >
        <ReactFlow<NoCartao, ArestaLigacao>
          nodes={nosVisiveis}
          edges={arestas}
          nodeTypes={TIPOS_NO}
          edgeTypes={TIPOS_ARESTA}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onConnectEnd={onConnectEnd}
          onNodeClick={onNodeClick}
          onNodeDragStart={onNodeDragStart}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          onlyRenderVisibleElements
          fitView
          fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
          minZoom={0.1}
          maxZoom={2.5}
          connectionMode={ConnectionMode.Loose}
          connectionLineStyle={{ stroke: "var(--primary)", strokeWidth: 2.5, strokeDasharray: "7 6" }}
          nodesDraggable={podeEditar}
          nodesConnectable={podeEditar}
          selectionOnDrag={!toque}
          selectionMode={SelectionMode.Partial}
          panOnDrag={toque ? true : [1, 2]}
          panActivationKeyCode="Space"
          deleteKeyCode={null}
          zoomOnDoubleClick={false}
          proOptions={{ hideAttribution: false }}
          attributionPosition="bottom-left"
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1.6} color="var(--border)" />
          <MiniMap
            pannable
            zoomable
            ariaLabel="Minimapa do quadro"
            nodeColor={(n) => {
              const c = (n as NoCartao).data?.cartao;
              return c && (c.tipo === "postit" || c.tipo === "texto" || c.tipo === "moldura") ? COR_MINIMAPA[c.cor] : "var(--primary)";
            }}
            nodeStrokeWidth={0}
          />
          <Controls showInteractive={false} orientation="horizontal" position="bottom-right" aria-label="Zoom" />
        </ReactFlow>

        {nos.length === 0 && (
          <div className="qt-vazio" aria-live="polite">
            <i className="fas fa-diagram-project" aria-hidden />
            <b>Quadro vazio</b>
            <span>
              {podeEditar
                ? "Use a barra de baixo, clique duas vezes no vazio ou arraste páginas da gaveta. Ligue os cartões pelas alças."
                : "Ainda não há nada neste quadro."}
            </span>
          </div>
        )}
      </div>

      <Topo mesaId={mesaId} quadro={quadro} />

      <Gaveta
        aberta={gavetaAberta}
        aba={abaGaveta}
        aoMudarAba={setAbaGaveta}
        aoFechar={() => setGavetaAberta(false)}
        paginas={conteudo.paginas}
        notas={conteudo.notas}
        sessoes={conteudo.sessoes}
        meuId={meuId}
        podeEditar={podeEditar}
        aoUsar={(item) => criarReferencia(item)}
      />
      {!gavetaAberta && (
        <button type="button" className="qt-btn qt-gaveta-abrir" onClick={() => setGavetaAberta(true)} title="Abrir a gaveta" aria-label="Abrir a gaveta">
          <i className="fas fa-folder-open" /> <span>Gaveta</span>
        </button>
      )}

      {podeEditar ? (
        <div className="qt-barra" role="toolbar" aria-label="Ferramentas do quadro">
          <button type="button" className="qt-ferr" onClick={() => criarTexto("postit")} title="Post-it (duplo clique no vazio)">
            <i className="fas fa-note-sticky" /> <span>Post-it</span>
          </button>
          <button type="button" className="qt-ferr" onClick={() => criarTexto("texto")} title="Texto solto">
            <i className="fas fa-font" /> <span>Texto</span>
          </button>
          <button type="button" className="qt-ferr" onClick={() => criarTexto("moldura")} title="Moldura de grupo">
            <i className="fas fa-object-group" /> <span>Moldura</span>
          </button>
          <button type="button" className="qt-ferr" onClick={() => arquivo.current?.click()} title="Imagem (ou cole com Ctrl+V)">
            <i className="fas fa-image" /> <span>Imagem</span>
          </button>
          <span className="qt-barra-sep" aria-hidden />
          <button type="button" className="qt-ferr" onClick={() => setBuscando(true)} title="Pendurar uma página (@)">
            <i className="fas fa-address-card" /> <span>Página</span>
          </button>
          <button type="button" className="qt-ferr" onClick={() => abrirGaveta("notas")} title="Anotações na gaveta">
            <i className="fas fa-file-lines" /> <span>Anotação</span>
          </button>
          <button type="button" className="qt-ferr" onClick={() => abrirGaveta("sessoes")} title="Sessões na gaveta">
            <i className="fas fa-flag" /> <span>Sessão</span>
          </button>
          <span className="qt-barra-sep" aria-hidden />
          <button
            type="button"
            className={`qt-ferr${ligar ? " qt-ferr--on" : ""}`}
            aria-pressed={ligar}
            onClick={() => (ligar ? sairDaLigacao() : setLigar(true))}
            title="Ligar dois cartões (ou arraste de uma alça)"
          >
            <i className="fas fa-link" /> <span>Ligação</span>
          </button>
          <input
            ref={arquivo}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              void enviarArquivos([...(e.target.files ?? [])]);
              e.target.value = "";
            }}
          />
        </div>
      ) : (
        <div className="qt-barra qt-barra--leitura" role="status">
          <i className="fas fa-eye" aria-hidden /> Somente leitura
        </div>
      )}

      {ligar && (
        <div className="qt-aviso" role="status">
          {ligandoDe ? "Agora clique no cartão de destino." : "Clique no cartão de origem."} <button type="button" onClick={sairDaLigacao}>Cancelar (Esc)</button>
        </div>
      )}
      {enviando > 0 && (
        <div className="qt-aviso" role="status">
          <i className="fas fa-spinner fa-spin" aria-hidden /> Enviando imagem…
        </div>
      )}

      {buscando && (
        <BuscaPagina
          paginas={conteudo.paginas}
          aoFechar={() => setBuscando(false)}
          aoEscolher={(id) => {
            setBuscando(false);
            criarReferencia({ tipo: "pagina", refId: id });
          }}
        />
      )}
    </QuadroContexto.Provider>
  );
}

function Topo({ mesaId, quadro }: { mesaId: string; quadro: QuadroAbertoDTO }) {
  const router = useRouter();
  const p = quadro.permissoes;
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(quadro.nome);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editando) campo.current?.select();
  }, [editando]);

  async function salvar() {
    setEditando(false);
    const novo = nome.trim();
    if (!novo || novo === quadro.nome) {
      setNome(quadro.nome);
      return;
    }
    try {
      exigir(await renomearQuadroDiario(mesaId, quadro.id, novo));
      router.refresh();
    } catch (e) {
      setNome(quadro.nome);
      avisar(e instanceof Error ? e.message : "Falha ao renomear.");
    }
  }

  const dono = quadro.donoId ? (quadro.donoId === quadro.meuId ? "Você" : (quadro.autores[quadro.donoId] ?? "Jogador")) : null;

  return (
    <header className="qt-topo">
      {/* Volta pelo histórico: de onde veio (lista do diário ou aba Diário da ficha). */}
      <BotaoVoltar fallbackHref={`/diario/${mesaId}?area=quadros`} className="qt-btn qt-btn--icone" title="Voltar">
        <i className="fas fa-arrow-left" />
      </BotaoVoltar>

      <div className="qt-titulo">
        {editando ? (
          <input
            ref={campo}
            className="qt-nome-campo"
            value={nome}
            maxLength={LIMITES_QUADRO.nome}
            aria-label="Nome do quadro"
            onChange={(e) => setNome(e.target.value)}
            onBlur={() => void salvar()}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                setNome(quadro.nome);
                setEditando(false);
              }
            }}
          />
        ) : p.renomear ? (
          <button type="button" className="qt-nome" onClick={() => setEditando(true)} title="Renomear">
            {quadro.nome} <i className="fas fa-pen" aria-hidden />
          </button>
        ) : (
          <h1 className="qt-nome qt-nome--fixo">{quadro.nome}</h1>
        )}
        <span className="qt-selos">
          {quadro.papel === "mesa" && (
            <span>
              <i className="fas fa-earth-americas" /> Da mesa · todos editam
            </span>
          )}
          {quadro.papel === "dono" && (
            <span title="O narrador também pode ler este quadro">
              <i className="fas fa-lock" /> Particular · o narrador também lê
            </span>
          )}
          {quadro.papel === "compartilhado" && (
            <span>
              <i className="fas fa-user-group" /> De {dono} · {quadro.nivel === "editar" ? "você edita" : "você vê"}
            </span>
          )}
          {p.narradorLendoPrivado && (
            <span>
              <i className="fas fa-eye" /> De {dono} · você lê como narrador
            </span>
          )}
        </span>
      </div>
    </header>
  );
}
