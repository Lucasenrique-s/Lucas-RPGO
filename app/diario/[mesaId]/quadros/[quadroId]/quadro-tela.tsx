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
import { componenteDe, caminhoMaisCurto, combinaBusca, visivelNaCamada } from "@/lib/diario-quadro-vista";
import { rotuloSessao } from "@/lib/diario-tipos";
import { acharLugarLivre, ajustarImagem, dentroDaMoldura, extrairUrl, pareceImagem, type Retangulo } from "@/lib/diario-quadro-geo";
import {
  LIMITES_QUADRO,
  TAMANHO_PADRAO,
  type CartaoDTO,
  type ConteudoQuadroDTO,
  type CorCartao,
  type FundoQuadro,
  type LigacaoDTO,
  type MudancasQuadroDTO,
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
  lerMudancasQuadro,
  restaurarCartoesQuadro,
  type DadosLigacao,
  type MudancaCartao,
  type NovoCartao,
} from "../../quadro-acoes";
import { definirFundoQuadro, renomearQuadroDiario } from "../../quadros-actions";
import { avisar, enviarImagem } from "../../diario-partes";
import { QuadroContexto, type ArestaLigacao, type CtxQuadro, type FormatoTexto, type NoCartao } from "./quadro-contexto";
import { ImagemNo, MapaNo, MolduraNo, NotaNo, PaginaNo, PostitNo, SessaoNo, TextoSoltoNo } from "./quadro-nos";
import { BarbanteAresta } from "./quadro-aresta";
import { Gaveta, TIPO_ARRASTE, type AbaGaveta, type ItemArrastado } from "./quadro-gaveta";
import { BuscaPagina } from "./quadro-busca";
import { Cursores, Presenca, criarBarramento, useCanalDoQuadro, type ArrastoRemoto } from "./quadro-aovivo";
import { Lixeira } from "./quadro-lixeira";
import { Vista, type Achado } from "./quadro-vista";
import { MenuContexto, type ItemMenu } from "./quadro-menu";
import { Compartilhar } from "./quadro-compartilhar";
import { EnviarParaMesa } from "./quadro-enviar";
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
  mapa: MapaNo,
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
  // Oculto (só o narrador vê): contorno tracejado e cadeado.
  className: c.oculto ? "qn-oculto" : undefined,
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

// Um passo do histórico (Ctrl+Z / Ctrl+Y). Os dois lados já cuidam de salvar.
type Passo = { desfazer: () => void; refazer: () => void };
// O que se perde e se recupera ao apagar (ou ao desfazer um criar).
type Snapshot = { cartoes: CartaoDTO[]; ligacoes: LigacaoDTO[] };

// Aplica uma mudança de cartão a um nó (posição, tamanho e campos do cartão).
function comMudanca(n: NoCartao, m: MudancaCartao): NoCartao {
  const campos: Partial<CartaoDTO> = {};
  if (m.texto !== undefined) campos.texto = m.texto;
  if (m.cor !== undefined) campos.cor = m.cor;
  if (m.formato !== undefined) campos.formato = m.formato;
  if (m.fonte !== undefined) campos.fonte = m.fonte;
  if (m.alinhamento !== undefined) campos.alinhamento = m.alinhamento;
  if (m.corTexto !== undefined) campos.corTexto = m.corTexto;
  if (m.negrito !== undefined) campos.negrito = m.negrito;
  if (m.oculto !== undefined) {
    campos.oculto = m.oculto;
    campos.reveladoSessaoId = m.reveladoSessaoId ?? null;
  }
  let no: NoCartao = { ...n, className: campos.oculto === undefined ? n.className : campos.oculto ? "qn-oculto" : undefined, data: { cartao: { ...n.data.cartao, ...campos } } };
  if (m.x !== undefined || m.y !== undefined) no = { ...no, position: { x: m.x ?? n.position.x, y: m.y ?? n.position.y } };
  if (m.largura !== undefined || m.altura !== undefined) {
    const r = rectDe(n);
    const largura = m.largura ?? r.largura;
    const altura = m.altura ?? r.altura;
    // Nó já redimensionado tem width/height próprios, que mandam sobre o style.
    no = { ...no, style: { ...no.style, width: largura, height: altura }, ...(n.width !== undefined ? { width: largura, height: altura } : {}) };
  }
  return no;
}

// O que desfaz a mudança `m` neste nó: os mesmos campos, com o valor de agora.
function inversoDe(m: MudancaCartao, n: NoCartao): MudancaCartao {
  const c = n.data.cartao;
  const r = rectDe(n);
  const inv: MudancaCartao = { id: m.id };
  if (m.x !== undefined) inv.x = n.position.x;
  if (m.y !== undefined) inv.y = n.position.y;
  if (m.largura !== undefined) inv.largura = r.largura;
  if (m.altura !== undefined) inv.altura = r.altura;
  if (m.texto !== undefined) inv.texto = c.texto;
  if (m.cor !== undefined) inv.cor = c.cor;
  if (m.formato !== undefined) inv.formato = c.formato;
  if (m.fonte !== undefined) inv.fonte = c.fonte;
  if (m.alinhamento !== undefined) inv.alinhamento = c.alinhamento;
  if (m.corTexto !== undefined) inv.corTexto = c.corTexto;
  if (m.negrito !== undefined) inv.negrito = c.negrito;
  if (m.oculto !== undefined) {
    inv.oculto = c.oculto;
    inv.reveladoSessaoId = c.reveladoSessaoId;
  }
  return inv;
}

// Junta um cartão que chegou (do servidor ou de uma restauração) à lista: troca se já existe, acrescenta se não.
function mesclarNo(ns: NoCartao[], c: CartaoDTO, podeEditar: boolean, selecionar: boolean): NoCartao[] {
  const i = ns.findIndex((n) => n.id === c.id);
  if (i < 0) return [...ns, { ...noDe(c, podeEditar), selected: selecionar }];
  const n = ns[i];
  // Quem está arrastando o cartão agora vence: a posição dele chega ao soltar.
  if (n.dragging) return ns;
  const novo: NoCartao = { ...noDe(c, podeEditar), selected: n.selected, ...(n.width !== undefined ? { width: c.largura, height: c.altura } : {}) };
  return ns.map((x, k) => (k === i ? novo : x));
}

function mesclarAresta(es: ArestaLigacao[], l: LigacaoDTO): ArestaLigacao[] {
  const i = es.findIndex((e) => e.id === l.id);
  if (i < 0) return [...es, arestaDe(l)];
  return es.map((e, k) => (k === i ? { ...arestaDe(l), selected: e.selected } : e));
}

const uniaoPorId = <T extends { id: string }>(atual: Map<string, T>, novos: T[]): Map<string, T> =>
  novos.length === 0 ? atual : new Map([...atual, ...novos.map((x): [string, T] => [x.id, x])]);

// O mapa de fundo entra na lista de nós só na hora de desenhar (nunca no estado nem no que se grava).
const ID_MAPA = "__mapa__";
const noMapa = (f: { url: string; largura: number; altura: number }): NoCartao =>
  ({
    id: ID_MAPA,
    type: "mapa",
    position: { x: 0, y: 0 },
    style: { width: f.largura, height: f.altura },
    draggable: false,
    selectable: false,
    focusable: false,
    connectable: false,
    deletable: false,
    zIndex: -10,
    className: "qn-mapa-no",
    data: { url: f.url },
    // O nó do mapa tem outra forma de dados que os cartões; o React Flow só repassa isso ao MapaNo.
  }) as unknown as NoCartao;

const ROTULO_TIPO: Record<TipoCartao, string> = {
  postit: "Post-it",
  pagina: "Página",
  nota: "Anotação",
  sessao: "Sessão",
  imagem: "Imagem",
  moldura: "Moldura",
  texto: "Texto",
};

// Tamanho do alfinete (a ponta é a base do nó).
const PINO = { largura: 40, altura: 48 };

type FocoInvestigacao = { nos: Set<string>; ligacoes: Set<string>; tipo: "grupo" | "caminho" | "semCaminho"; passos: number };
type MenuAlvo = { x: number; y: number; alvo: string | null; pos: { x: number; y: number } };

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
  // Formas de olhar: investigação, camadas por sessão, busca, cor por autor, mapa e o menu do toque longo.
  const [investigando, setInvestigando] = useState(false);
  const [focoA, setFocoA] = useState<string | null>(null);
  const [focoB, setFocoB] = useState<string | null>(null);
  const [camada, setCamada] = useState<number | null>(null);
  const [porAutor, setPorAutor] = useState(false);
  const [termo, setTermo] = useState("");
  const [menu, setMenu] = useState<MenuAlvo | null>(null);
  const [fundo, setFundo] = useState<FundoQuadro>(quadro.fundo);
  const [enviandoMapa, setEnviandoMapa] = useState(false);
  const area = useRef<HTMLDivElement>(null);
  const arquivo = useRef<HTMLInputElement>(null);

  // O que os cartões de referência mostram; cresce quando chega um cartão novo de outra pessoa.
  const [refs, setRefs] = useState(() => ({
    paginas: new Map(conteudo.paginas.map((p) => [p.id, p])),
    notas: new Map(conteudo.notas.map((n) => [n.id, n])),
    sessoes: new Map(conteudo.sessoes.map((x) => [x.id, x])),
  }));
  const { paginas, notas, sessoes } = refs;

  useEffect(() => {
    const t = window.setTimeout(() => {
      setGavetaAberta(window.innerWidth >= 900);
      setToque(window.matchMedia("(pointer: coarse)").matches);
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  // ─── Salvar: uma fila só, na ordem (criar antes de editar o mesmo cartão) ───
  const fila = useRef<Promise<void>>(Promise.resolve());
  // Escritas na fila: enquanto há alguma, o que chega dos outros espera (a nossa é a última palavra).
  const pendentes = useRef(0);
  const adiado = useRef(false);
  const sincronizarRef = useRef<() => void>(() => {});
  const enfileirar = useCallback((fn: () => Promise<Resultado<object>>) => {
    pendentes.current++;
    fila.current = fila.current.then(async () => {
      try {
        exigir(await fn());
      } catch (e) {
        avisar(e instanceof Error ? e.message : "Não foi possível salvar. Recarregue o quadro.");
      } finally {
        pendentes.current--;
        if (pendentes.current === 0 && adiado.current) {
          adiado.current = false;
          sincronizarRef.current();
        }
      }
    });
  }, []);

  const persistirMudancas = useCallback(
    (m: MudancaCartao[]) => {
      if (m.length > 0) enfileirar(() => atualizarCartoesQuadro(mesaId, quadro.id, m));
    },
    [enfileirar, mesaId, quadro.id],
  );

  // Cartões mexidos aqui há pouco: a sincronia não os troca pelo que chegou dos outros.
  const recentes = useRef(new Map<string, number>());
  const marcar = useCallback((ids: string[]) => {
    const t = Date.now();
    for (const id of ids) recentes.current.set(id, t);
  }, []);

  // ─── Desfazer e refazer (Ctrl+Z, Ctrl+Y): locais, até 100 passos ───────────
  const pilha = useRef<Passo[]>([]);
  const refeitos = useRef<Passo[]>([]);
  const registrar = useCallback((p: Passo) => {
    pilha.current.push(p);
    if (pilha.current.length > 100) pilha.current.shift();
    refeitos.current = [];
  }, []);
  const desfazer = useCallback(() => {
    const p = pilha.current.pop();
    if (!p) return;
    refeitos.current.push(p);
    p.desfazer();
  }, []);
  const refazer = useCallback(() => {
    const p = refeitos.current.pop();
    if (!p) return;
    pilha.current.push(p);
    p.refazer();
  }, []);

  // Muda e salva, sem registrar (é o que o histórico usa pra ir e voltar).
  const aplicarCartoes = useCallback(
    (ms: MudancaCartao[]) => {
      const porId = new Map(ms.map((m) => [m.id, m]));
      marcar(ms.map((m) => m.id));
      setNos((ns) =>
        ns.map((n) => {
          const m = porId.get(n.id);
          return m ? comMudanca(n, m) : n;
        }),
      );
      persistirMudancas(ms);
    },
    [marcar, persistirMudancas],
  );

  // Muda, salva e registra no histórico.
  const editarCartoes = useCallback(
    (ms: MudancaCartao[]) => {
      const antes = ms.flatMap((m) => {
        const n = rf.getNode(m.id);
        return n ? [inversoDe(m, n)] : [];
      });
      if (antes.length === 0) return;
      aplicarCartoes(ms);
      registrar({ desfazer: () => aplicarCartoes(antes), refazer: () => aplicarCartoes(ms) });
    },
    [rf, aplicarCartoes, registrar],
  );

  // Entra e sai de cena (local); quem chama decide se salva e se registra.
  const incluirLocal = useCallback(
    (cs: CartaoDTO[], ligs: LigacaoDTO[], selecionar: boolean) => {
      marcar([...cs.map((c) => c.id), ...ligs.map((l) => l.id)]);
      setNos((ns) => {
        let r = selecionar ? ns.map((n) => (n.selected ? { ...n, selected: false } : n)) : ns;
        for (const c of cs) r = mesclarNo(r, c, podeEditar, selecionar);
        return r;
      });
      setArestas((es) => {
        let r = selecionar ? es.map((e) => (e.selected ? { ...e, selected: false } : e)) : es;
        for (const l of ligs) r = mesclarAresta(r, l);
        return r;
      });
    },
    [marcar, podeEditar],
  );

  const excluirLocal = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      const s = new Set(ids);
      marcar(ids);
      setNos((ns) => ns.filter((n) => !s.has(n.id)));
      setArestas((es) => es.filter((e) => !s.has(e.source) && !s.has(e.target)));
      setEditando(null);
      enfileirar(() => apagarCartoesQuadro(mesaId, quadro.id, ids));
    },
    [marcar, enfileirar, mesaId, quadro.id],
  );

  const restaurarLocal = useCallback(
    (snap: Snapshot) => {
      incluirLocal(snap.cartoes, snap.ligacoes, false);
      enfileirar(() =>
        restaurarCartoesQuadro(
          mesaId,
          quadro.id,
          snap.cartoes.map((c) => c.id),
          snap.ligacoes.map((l) => l.id),
        ),
      );
    },
    [incluirLocal, enfileirar, mesaId, quadro.id],
  );

  // ─── Tempo real: o que chega dos outros ──────────────────────────────────
  const aplicarRemoto = useCallback(
    (m: MudancasQuadroDTO) => {
      if (m.paginas.length + m.notas.length + m.sessoes.length > 0) {
        setRefs((r) => ({ paginas: uniaoPorId(r.paginas, m.paginas), notas: uniaoPorId(r.notas, m.notas), sessoes: uniaoPorId(r.sessoes, m.sessoes) }));
      }
      setFundo((f) => (f?.url === m.fundo?.url && f?.largura === m.fundo?.largura && f?.altura === m.fundo?.altura ? f : m.fundo));
      const limite = Date.now() - 2500;
      const recente = (id: string) => (recentes.current.get(id) ?? 0) > limite;
      const novos = m.cartoes.filter((c) => !recente(c.id));
      const sumiram = new Set(m.removidos.filter((id) => !recente(id)));
      if (novos.length + sumiram.size > 0) {
        setNos((ns) => {
          let r = sumiram.size > 0 ? ns.filter((n) => !sumiram.has(n.id)) : ns;
          for (const c of novos) r = mesclarNo(r, c, podeEditar, false);
          return r;
        });
        if (sumiram.size > 0) setEditando((e) => (e && sumiram.has(e) ? null : e));
      }
      const ligsNovas = m.ligacoes.filter((l) => !recente(l.id));
      const ligsSumiram = new Set(m.ligacoesRemovidas.filter((id) => !recente(id)));
      if (ligsNovas.length + ligsSumiram.size > 0 || sumiram.size > 0) {
        setArestas((es) => {
          let r = es.filter((e) => !ligsSumiram.has(e.id) && !sumiram.has(e.source) && !sumiram.has(e.target));
          for (const l of ligsNovas) r = mesclarAresta(r, l);
          return r;
        });
      }
    },
    [podeEditar],
  );

  const ultimaLeitura = useRef(conteudo.agora);
  const lendo = useRef(false);
  const repetir = useRef(false);
  const sincronizar = useCallback(async () => {
    // Escrevendo: espera a fila esvaziar (ela chama de novo ao terminar).
    if (pendentes.current > 0) {
      adiado.current = true;
      return;
    }
    if (lendo.current) {
      repetir.current = true;
      return;
    }
    lendo.current = true;
    try {
      do {
        repetir.current = false;
        // Uma folga de 2 s: reentregar o mesmo cartão não faz mal, perder um faz.
        const desde = new Date(new Date(ultimaLeitura.current).getTime() - 2000).toISOString();
        const r = exigir(await lerMudancasQuadro(mesaId, quadro.id, desde));
        aplicarRemoto(r.mudancas);
        ultimaLeitura.current = r.mudancas.agora;
      } while (repetir.current);
    } catch {
      /* sem rede: o próximo aviso, ou voltar pra aba, tenta de novo */
    } finally {
      lendo.current = false;
    }
  }, [mesaId, quadro.id, aplicarRemoto]);
  useEffect(() => {
    sincronizarRef.current = () => void sincronizar();
  }, [sincronizar]);

  const [chave] = useState(() => crypto.randomUUID());
  const [barramento] = useState(criarBarramento);
  const espera = useRef<number | undefined>(undefined);
  const aoMudar = useCallback(() => {
    window.clearTimeout(espera.current);
    espera.current = window.setTimeout(() => void sincronizar(), 150);
  }, [sincronizar]);

  // Arrasto de outra pessoa, ao vivo: só move o cartão na tela (o valor final chega pela sincronia).
  const aoArrastoRemoto = useCallback((itens: ArrastoRemoto) => {
    const limite = Date.now() - 2500;
    const porId = new Map(itens.map((i) => [i.id, i]));
    setNos((ns) =>
      ns.map((n) => {
        const i = porId.get(n.id);
        if (!i || n.dragging || (recentes.current.get(n.id) ?? 0) > limite) return n;
        return { ...n, position: { x: i.x, y: i.y } };
      }),
    );
  }, []);

  const { enviarCursor, enviarArrasto } = useCanalDoQuadro({ quadroId: quadro.id, meuId, chave, barramento, aoMudar, aoArrasto: aoArrastoRemoto });

  // Voltar pra aba (ou ao foco) confere o que mudou enquanto esteve fora.
  useEffect(() => {
    const conferir = () => {
      if (document.visibilityState === "visible") void sincronizar();
    };
    document.addEventListener("visibilitychange", conferir);
    window.addEventListener("focus", conferir);
    return () => {
      document.removeEventListener("visibilitychange", conferir);
      window.removeEventListener("focus", conferir);
      window.clearTimeout(espera.current);
    };
  }, [sincronizar]);

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
          tipo === "moldura" ? [] : rf.getNodes().filter((n) => n.type !== "moldura" && n.type !== "mapa").map(rectDe),
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
      setCamada(null);
      incluirLocal(cs, ligacoes, true);
      enfileirar(() => criarCartoesQuadro(mesaId, quadro.id, cs.map(paraNovo)));
      for (const l of ligacoes) enfileirar(() => criarLigacaoQuadro(mesaId, quadro.id, l.id, l.deId, l.paraId, { rotulo: l.rotulo, cor: l.cor, traco: l.traco, seta: l.seta }));
      const snap: Snapshot = { cartoes: cs, ligacoes };
      registrar({ desfazer: () => excluirLocal(cs.map((c) => c.id)), refazer: () => restaurarLocal(snap) });
    },
    [podeEditar, nos.length, incluirLocal, enfileirar, mesaId, quadro.id, registrar, excluirLocal, restaurarLocal],
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
      // Num quadro com mapa, página de Local já nasce como alfinete.
      const pino = fundo && item.tipo === "pagina" && paginas.get(item.refId)?.tipo === "local";
      adicionar([novo(item.tipo, onde, { refId: item.refId, ...(pino ? { formato: "alfinete" as const, ...PINO } : {}) })]);
    },
    [novo, adicionar, fundo, paginas],
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
      editarCartoes([{ id, texto }]);
    },
    [rf, editarCartoes],
  );

  // O tamanho antes de redimensionar (pra poder desfazer).
  const antesTamanho = useRef(new Map<string, Retangulo>());
  const iniciarTamanho = useCallback(
    (id: string) => {
      const n = rf.getNode(id);
      if (n) antesTamanho.current.set(id, rectDe(n));
    },
    [rf],
  );
  const salvarTamanho = useCallback(
    (id: string, g: { x: number; y: number; largura: number; altura: number }) => {
      const antes = antesTamanho.current.get(id);
      antesTamanho.current.delete(id);
      const depois: MudancaCartao = { id, ...g };
      marcar([id]);
      persistirMudancas([depois]);
      if (antes) {
        const volta: MudancaCartao = { id, x: antes.x, y: antes.y, largura: antes.largura, altura: antes.altura };
        registrar({ desfazer: () => aplicarCartoes([volta]), refazer: () => aplicarCartoes([depois]) });
      }
    },
    [marcar, persistirMudancas, registrar, aplicarCartoes],
  );

  const mudarCor = useCallback(
    (ids: string[], cor: CorCartao) => {
      setUltimaCor(cor);
      editarCartoes(ids.map((id) => ({ id, cor })));
    },
    [editarCartoes],
  );

  const podeOcultar = quadro.permissoes.ocultar;
  const ocultar = useCallback(
    (ids: string[], oculto: boolean) => editarCartoes(ids.map((id) => ({ id, oculto, reveladoSessaoId: oculto ? null : conteudo.sessaoAtualId }))),
    [editarCartoes, conteudo.sessaoAtualId],
  );

  const formatar = useCallback((ids: string[], f: FormatoTexto) => editarCartoes(ids.map((id) => ({ id, ...f }))), [editarCartoes]);

  const tirarSnapshot = useCallback(
    (ids: string[]): Snapshot => {
      const s = new Set(ids);
      return {
        cartoes: rf.getNodes().filter((n) => s.has(n.id)).map(cartaoAtual),
        ligacoes: rf
          .getEdges()
          .filter((e) => (s.has(e.source) || s.has(e.target)) && e.data)
          .map((e) => (e.data as { ligacao: LigacaoDTO }).ligacao),
      };
    },
    [rf],
  );

  const apagar = useCallback(
    (ids: string[]) => {
      if (!podeEditar || ids.length === 0) return;
      const snap = tirarSnapshot(ids);
      if (snap.cartoes.length === 0) return;
      const existentes = snap.cartoes.map((c) => c.id);
      excluirLocal(existentes);
      registrar({ desfazer: () => restaurarLocal(snap), refazer: () => excluirLocal(existentes) });
    },
    [podeEditar, tirarSnapshot, excluirLocal, restaurarLocal, registrar],
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
  const excluirLigacaoLocal = useCallback(
    (id: string) => {
      marcar([id]);
      setArestas((es) => es.filter((e) => e.id !== id));
      enfileirar(() => apagarLigacaoQuadro(mesaId, quadro.id, id));
    },
    [marcar, enfileirar, mesaId, quadro.id],
  );

  const restaurarLigacaoLocal = useCallback(
    (l: LigacaoDTO) => {
      marcar([l.id]);
      setArestas((es) => mesclarAresta(es, l));
      enfileirar(() => restaurarCartoesQuadro(mesaId, quadro.id, [], [l.id]));
    },
    [marcar, enfileirar, mesaId, quadro.id],
  );

  const novaLigacao = useCallback(
    (de: string, para: string) => {
      if (!podeEditar || de === para) return;
      const l: LigacaoDTO = { id: crypto.randomUUID(), deId: de, paraId: para, rotulo: "", cor: "cinza", traco: "continuo", seta: false, autorId: meuId, oculto: false, reveladoSessaoId: null };
      // Já nasce selecionada: a barra de edição abre pra dar rótulo e cor.
      marcar([l.id]);
      setNos((ns) => ns.map((n) => (n.selected ? { ...n, selected: false } : n)));
      setArestas((es) => [...es.map((e) => (e.selected ? { ...e, selected: false } : e)), { ...arestaDe(l), selected: true }]);
      enfileirar(() => criarLigacaoQuadro(mesaId, quadro.id, l.id, de, para));
      registrar({ desfazer: () => excluirLigacaoLocal(l.id), refazer: () => restaurarLigacaoLocal(l) });
    },
    [podeEditar, meuId, marcar, enfileirar, mesaId, quadro.id, registrar, excluirLigacaoLocal, restaurarLigacaoLocal],
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

  const aplicarLigacao = useCallback(
    (id: string, dados: DadosLigacao) => {
      marcar([id]);
      setArestas((es) => es.map((e) => (e.id === id && e.data ? { ...e, data: { ligacao: { ...e.data.ligacao, ...dados } } } : e)));
      enfileirar(() => atualizarLigacaoQuadro(mesaId, quadro.id, id, dados));
    },
    [marcar, enfileirar, mesaId, quadro.id],
  );

  const atualizarLigacao = useCallback(
    (id: string, dados: DadosLigacao) => {
      const atual = rf.getEdge(id)?.data?.ligacao;
      if (!atual) return;
      const antes: DadosLigacao = {};
      if (dados.rotulo !== undefined) antes.rotulo = atual.rotulo;
      if (dados.cor !== undefined) antes.cor = atual.cor;
      if (dados.traco !== undefined) antes.traco = atual.traco;
      if (dados.seta !== undefined) antes.seta = atual.seta;
      if (dados.oculto !== undefined) {
        antes.oculto = atual.oculto;
        antes.reveladoSessaoId = atual.reveladoSessaoId;
      }
      aplicarLigacao(id, dados);
      registrar({ desfazer: () => aplicarLigacao(id, antes), refazer: () => aplicarLigacao(id, dados) });
    },
    [rf, aplicarLigacao, registrar],
  );

  const ocultarLigacao = useCallback(
    (id: string, oculto: boolean) => atualizarLigacao(id, { oculto, reveladoSessaoId: oculto ? null : conteudo.sessaoAtualId }),
    [atualizarLigacao, conteudo.sessaoAtualId],
  );

  const apagarLigacao = useCallback(
    (id: string) => {
      const l = rf.getEdge(id)?.data?.ligacao;
      if (!l) return;
      excluirLigacaoLocal(id);
      registrar({ desfazer: () => restaurarLigacaoLocal(l), refazer: () => excluirLigacaoLocal(id) });
    },
    [rf, excluirLigacaoLocal, restaurarLigacaoLocal, registrar],
  );

  const selecionarLigacao = useCallback((id: string) => {
    setNos((ns) => ns.map((n) => (n.selected ? { ...n, selected: false } : n)));
    setArestas((es) => es.map((e) => ({ ...e, selected: e.id === id })));
  }, []);

  // ─── Mover (e levar o que está dentro da moldura) ────────────────────────
  const arrasto = useRef<{ base: { x: number; y: number }; extras: { id: string; x: number; y: number }[]; antes: MudancaCartao[] } | null>(null);

  const onNodeDragStart = useCallback(
    (_: unknown, node: NoCartao, arrastados: NoCartao[]) => {
      const antes: MudancaCartao[] = arrastados.map((n) => ({ id: n.id, x: n.position.x, y: n.position.y }));
      const base = { x: node.position.x, y: node.position.y };
      if (node.type !== "moldura") {
        arrasto.current = { base, extras: [], antes };
        return;
      }
      const ids = new Set(arrastados.map((n) => n.id));
      const m = rectDe(node);
      const extras = rf
        .getNodes()
        .filter((n) => !ids.has(n.id) && n.type !== "moldura" && n.type !== "mapa" && dentroDaMoldura(m, rectDe(n)))
        .map((n) => ({ id: n.id, x: n.position.x, y: n.position.y }));
      arrasto.current = { base, extras, antes: [...antes, ...extras.map((x): MudancaCartao => ({ id: x.id, x: x.x, y: x.y }))] };
    },
    [rf],
  );

  const onNodeDrag = useCallback(
    (_: unknown, node: NoCartao, arrastados: NoCartao[]) => {
      const a = arrasto.current;
      if (!a) return;
      const itens: ArrastoRemoto = arrastados.map((n) => ({ id: n.id, x: n.position.x, y: n.position.y }));
      if (node.type === "moldura" && a.extras.length > 0) {
        const dx = node.position.x - a.base.x;
        const dy = node.position.y - a.base.y;
        const porId = new Map(a.extras.map((x) => [x.id, x]));
        setNos((ns) =>
          ns.map((n) => {
            const x = porId.get(n.id);
            return x ? { ...n, position: { x: x.x + dx, y: x.y + dy } } : n;
          }),
        );
        for (const x of a.extras) itens.push({ id: x.id, x: x.x + dx, y: x.y + dy });
      }
      enviarArrasto(itens);
    },
    [enviarArrasto],
  );

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
      // Clicou sem mover: nada a salvar nem a desfazer.
      if (a && m.every((x) => a.antes.some((o) => o.id === x.id && o.x === x.x && o.y === x.y))) return;
      marcar(m.map((x) => x.id));
      persistirMudancas(m);
      if (a) registrar({ desfazer: () => aplicarCartoes(a.antes), refazer: () => aplicarCartoes(m) });
    },
    [marcar, persistirMudancas, registrar, aplicarCartoes],
  );

  const onNodesChange = useCallback((c: NodeChange<NoCartao>[]) => setNos((ns) => applyNodeChanges(c, ns)), []);
  const onEdgesChange = useCallback((c: EdgeChange<ArestaLigacao>[]) => setArestas((es) => applyEdgeChanges(c, es)), []);

  // Ferramenta "Ligação": clicar no cartão de origem e depois no de destino.
  const onNodeClick = useCallback(
    (_: unknown, node: NoCartao) => {
      if (investigando) {
        if (node.id === ID_MAPA) return;
        // Primeiro clique escolhe o cartão; o segundo, o destino; um terceiro recomeça.
        if (!focoA || focoB) {
          setFocoA(node.id);
          setFocoB(null);
        } else if (node.id !== focoA) setFocoB(node.id);
        return;
      }
      if (!ligar) return;
      if (!ligandoDe) setLigandoDe(node.id);
      else {
        if (node.id !== ligandoDe) novaLigacao(ligandoDe, node.id);
        setLigandoDe(null);
        setLigar(false);
      }
    },
    [investigando, focoA, focoB, ligar, ligandoDe, novaLigacao],
  );

  const sairDaLigacao = useCallback(() => {
    setLigar(false);
    setLigandoDe(null);
  }, []);

  const sairDaInvestigacao = useCallback(() => {
    setInvestigando(false);
    setFocoA(null);
    setFocoB(null);
    setMenu(null);
  }, []);

  // ─── Atalhos, colar e soltar ─────────────────────────────────────────────
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (digitando(e.target) || buscando) return;
      if (e.key === "Escape") {
        sairDaLigacao();
        sairDaInvestigacao();
        return;
      }
      if (!podeEditar) return;
      const comando = e.ctrlKey || e.metaKey;
      if (comando && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) refazer();
        else desfazer();
        return;
      }
      if (comando && e.key.toLowerCase() === "y") {
        e.preventDefault();
        refazer();
        return;
      }
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
  }, [podeEditar, buscando, rf, desfazer, refazer, apagar, apagarLigacao, duplicar, enviarArquivos, criarImagemPorUrl, adicionar, novo, sairDaLigacao, sairDaInvestigacao]);

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

  // O que "Enviar para o quadro da mesa" leva: o selecionado e, de cada moldura selecionada, o que está dentro dela.
  const paraEnviar = useMemo(() => {
    const sel = nos.filter((n) => n.selected);
    const ids = new Set(sel.map((n) => n.id));
    for (const m of sel.filter((n) => n.type === "moldura")) {
      const r = rectDe(m);
      for (const n of nos) if (n.type !== "moldura" && !ids.has(n.id) && dentroDaMoldura(r, rectDe(n))) ids.add(n.id);
    }
    return [...ids];
  }, [nos]);

  // ─── O que a pessoa vê: camadas, investigação, busca e cor por autor ──────────
  const ordemSessoes = useMemo(() => [...sessoes.values()].sort((a, b) => a.iniciadaEm.localeCompare(b.iniciadaEm)), [sessoes]);
  const idsDaOrdem = useMemo(() => ordemSessoes.map((s) => s.id), [ordemSessoes]);

  const rotuloDoCartao = useCallback(
    (c: CartaoDTO): string => {
      if (c.tipo === "pagina") return paginas.get(c.refId ?? "")?.nome ?? "Página";
      if (c.tipo === "nota") {
        const n = notas.get(c.refId ?? "");
        return (n ? (n.titulo ?? n.previa.slice(0, 40)) : "") || "Anotação";
      }
      if (c.tipo === "sessao") {
        const s = sessoes.get(c.refId ?? "");
        return s ? rotuloSessao(s) : "Sessão";
      }
      return c.texto.trim().split("\n")[0].slice(0, 48) || ROTULO_TIPO[c.tipo];
    },
    [paginas, notas, sessoes],
  );

  // O que a busca lê num cartão: o texto dele, ou o nome e a prévia do que ele aponta.
  const textoBuscavel = useCallback(
    (c: CartaoDTO): string => {
      if (c.tipo === "pagina") return `${paginas.get(c.refId ?? "")?.nome ?? ""} ${paginas.get(c.refId ?? "")?.previa ?? ""}`;
      if (c.tipo === "nota") return `${notas.get(c.refId ?? "")?.titulo ?? ""} ${notas.get(c.refId ?? "")?.previa ?? ""}`;
      if (c.tipo === "sessao") return rotuloDoCartao(c);
      return c.texto;
    },
    [paginas, notas, rotuloDoCartao],
  );

  const achados = useMemo<Achado[]>(
    () =>
      termo.trim() === ""
        ? []
        : nos.filter((n) => combinaBusca(textoBuscavel(n.data.cartao), termo)).map((n) => ({ id: n.id, rotulo: rotuloDoCartao(n.data.cartao), tipo: n.data.cartao.tipo })),
    [nos, termo, textoBuscavel, rotuloDoCartao],
  );
  const idsAchados = useMemo(() => new Set(achados.map((a) => a.id)), [achados]);

  const autoresPresentes = useMemo(
    () => [...new Set(nos.map((n) => n.data.cartao.autorId))].map((id) => ({ id, nome: id === meuId ? "Você" : (quadro.autores[id] ?? "Jogador") })),
    [nos, meuId, quadro.autores],
  );

  // Modo investigação: sem foco não há nada; um foco mostra o "bando" dele; dois mostram o caminho mais curto.
  const grafo = useMemo(() => arestas.map((e) => ({ id: e.id, de: e.source, para: e.target })), [arestas]);
  const investigacao = useMemo<FocoInvestigacao | null>(() => {
    if (!investigando || !focoA) return null;
    if (focoB) {
      const c = caminhoMaisCurto(focoA, focoB, grafo);
      if (c) return { nos: new Set(c.nos), ligacoes: new Set(c.ligacoes), tipo: "caminho", passos: c.ligacoes.length };
      const g = componenteDe(focoA, grafo);
      return { nos: g.nos, ligacoes: g.ligacoes, tipo: "semCaminho", passos: 0 };
    }
    const g = componenteDe(focoA, grafo);
    return { nos: g.nos, ligacoes: g.ligacoes, tipo: "grupo", passos: 0 };
  }, [investigando, focoA, focoB, grafo]);

  const nosVisiveis = useMemo(() => {
    const lista = nos.map((n) => {
      const classes: string[] = [];
      if (n.className) classes.push(n.className);
      if (ligandoDe === n.id) classes.push("qn-origem");
      if (investigacao) {
        classes.push(investigacao.nos.has(n.id) ? "qn-destaque" : "qn-esmaecido");
        if (n.id === focoA || n.id === focoB) classes.push("qn-foco");
      }
      if (termo.trim() !== "" && idsAchados.has(n.id)) classes.push("qn-achado");
      const escondido = !visivelNaCamada(n.data.cartao.sessaoId, idsDaOrdem, camada);
      const className = classes.length > 0 ? classes.join(" ") : undefined;
      if (className === n.className && !escondido && !n.hidden) return n;
      return { ...n, className, hidden: escondido };
    });
    return fundo ? [noMapa(fundo), ...lista] : lista;
  }, [nos, ligandoDe, investigacao, focoA, focoB, termo, idsAchados, idsDaOrdem, camada, fundo]);

  const arestasVisiveis = useMemo(
    () => (investigacao ? arestas.map((e) => ({ ...e, className: investigacao.ligacoes.has(e.id) ? "qa-destaque" : "qa-esmaecida" })) : arestas),
    [arestas, investigacao],
  );
  const ligacaoEsmaecida = useCallback((id: string) => !!investigacao && !investigacao.ligacoes.has(id), [investigacao]);

  // ─── Investigar, buscar, mapa e toque longo ──────────────────────────────
  const alternarInvestigacao = useCallback(() => {
    setInvestigando((v) => !v);
    setFocoA(null);
    setFocoB(null);
  }, []);

  const irPara = useCallback(
    (id: string) => {
      const n = rf.getNode(id);
      if (!n) return;
      setCamada(null);
      setNos((ns) => ns.map((x) => (x.selected === (x.id === id) ? x : { ...x, selected: x.id === id })));
      const r = rectDe(n);
      void rf.setCenter(r.x + r.largura / 2, r.y + r.altura / 2, { zoom: Math.max(rf.getZoom(), 0.9), duration: 400 });
    },
    [rf],
  );

  // Post-it e página viram alfinete (e voltam a ser cartão) com o tamanho de cada forma.
  const alfinete = useCallback(
    (id: string, sim: boolean) => {
      const n = rf.getNode(id);
      if (!n) return;
      const t = n.data.cartao.tipo;
      editarCartoes([sim ? { id, formato: "alfinete", largura: PINO.largura, altura: PINO.altura } : { id, formato: "cartao", largura: TAMANHO_PADRAO[t].largura, altura: TAMANHO_PADRAO[t].altura }]);
    },
    [rf, editarCartoes],
  );

  const criarAlfineteLivre = useCallback(
    (onde: { x: number; y: number } | null = null) => {
      const c = novo("postit", onde, { formato: "alfinete", ...PINO });
      adicionar([c]);
      setEditando(c.id);
    },
    [novo, adicionar],
  );

  const trocarMapa = useCallback(
    async (f: File) => {
      setEnviandoMapa(true);
      try {
        const url = await enviarImagem(mesaId, meuId, f);
        const medidas = await new Promise<{ largura: number; altura: number }>((ok, erro) => {
          const img = new Image();
          img.onload = () => ok({ largura: img.naturalWidth, altura: img.naturalHeight });
          img.onerror = () => erro(new Error("Não foi possível ler essa imagem."));
          img.src = url;
        });
        exigir(await definirFundoQuadro(mesaId, quadro.id, { url, ...medidas }));
        setFundo({ url, ...medidas });
        window.setTimeout(() => void rf.fitView({ padding: 0.08, duration: 400 }), 150);
      } catch (e) {
        avisar(e instanceof Error ? e.message : "Não foi possível pôr o mapa.");
      } finally {
        setEnviandoMapa(false);
      }
    },
    [mesaId, meuId, quadro.id, rf],
  );

  const tirarMapa = useCallback(async () => {
    setEnviandoMapa(true);
    try {
      exigir(await definirFundoQuadro(mesaId, quadro.id, null));
      setFundo(null);
    } catch (e) {
      avisar(e instanceof Error ? e.message : "Não foi possível tirar o mapa.");
    } finally {
      setEnviandoMapa(false);
    }
  }, [mesaId, quadro.id]);

  // Toque longo (celular): abre o menu do que está sob o dedo. O mouse não usa: clique e arrasto já fazem tudo.
  const menuAbertoEm = useRef(0);
  const toqueLongo = useRef<{ timer: number; x: number; y: number } | null>(null);
  const cancelarToqueLongo = useCallback(() => {
    if (toqueLongo.current) window.clearTimeout(toqueLongo.current.timer);
    toqueLongo.current = null;
  }, []);
  useEffect(() => cancelarToqueLongo, [cancelarToqueLongo]);

  const aoPressionar = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === "mouse") return;
      cancelarToqueLongo();
      const alvo = e.target instanceof HTMLElement ? e.target : null;
      // Alças, barras e controles têm o próprio toque.
      if (alvo?.closest(".react-flow__handle, .qn-minibarra, .qa-barra, .react-flow__controls, .react-flow__minimap")) return;
      const id = alvo?.closest(".react-flow__node")?.getAttribute("data-id") ?? null;
      const x = e.clientX;
      const y = e.clientY;
      const timer = window.setTimeout(() => {
        toqueLongo.current = null;
        menuAbertoEm.current = Date.now();
        const cartao = id && id !== ID_MAPA ? id : null;
        if (cartao) setNos((ns) => ns.map((n) => (n.selected === (n.id === cartao) ? n : { ...n, selected: n.id === cartao })));
        setMenu({ x, y, alvo: cartao, pos: rf.screenToFlowPosition({ x, y }) });
      }, 550);
      toqueLongo.current = { timer, x, y };
    },
    [cancelarToqueLongo, rf],
  );
  const moverToqueLongo = useCallback(
    (e: React.PointerEvent) => {
      const t = toqueLongo.current;
      if (t && Math.hypot(e.clientX - t.x, e.clientY - t.y) > 10) cancelarToqueLongo();
    },
    [cancelarToqueLongo],
  );

  const aoClicarNoVazio = useCallback(() => {
    // O levantar do dedo depois do toque longo também chega aqui: não fecha o menu que acabou de abrir.
    if (Date.now() - menuAbertoEm.current < 800) return;
    setMenu(null);
    if (investigando) {
      setFocoA(null);
      setFocoB(null);
    }
  }, [investigando]);

  const itensDoMenu = useCallback(
    (m: MenuAlvo): { titulo: string; itens: ItemMenu[] } => {
      const itens: ItemMenu[] = [];
      if (!m.alvo) {
        if (podeEditar) {
          itens.push(
            { rotulo: "Post-it aqui", icone: "fa-note-sticky", aoEscolher: () => criarTexto("postit", m.pos) },
            { rotulo: "Texto aqui", icone: "fa-font", aoEscolher: () => criarTexto("texto", m.pos) },
            { rotulo: "Moldura aqui", icone: "fa-object-group", aoEscolher: () => criarTexto("moldura", m.pos) },
            { rotulo: "Pendurar uma página", icone: "fa-address-card", aoEscolher: () => setBuscando(true) },
          );
          if (fundo) itens.push({ rotulo: "Alfinete aqui", icone: "fa-location-dot", aoEscolher: () => criarAlfineteLivre(m.pos) });
        }
        itens.push({ rotulo: "Ver tudo", icone: "fa-expand", aoEscolher: () => void rf.fitView({ padding: 0.2, duration: 300 }) });
        return { titulo: "Quadro", itens };
      }
      const n = rf.getNode(m.alvo);
      if (!n) return { titulo: "", itens: [] };
      const c = n.data.cartao;
      const id = c.id;
      const referencia = c.tipo === "pagina" || c.tipo === "nota" || c.tipo === "sessao";
      if (referencia) itens.push({ rotulo: "Abrir no diário", icone: "fa-arrow-up-right-from-square", aoEscolher: () => abrirReferencia(c) });
      if (podeEditar && !referencia) itens.push({ rotulo: "Editar o texto", icone: "fa-pen", aoEscolher: () => setEditando(id) });
      if (podeEditar) {
        itens.push(
          { rotulo: "Duplicar", icone: "fa-clone", aoEscolher: () => duplicar([id]) },
          {
            rotulo: "Ligar a outro cartão",
            icone: "fa-link",
            aoEscolher: () => {
              setLigar(true);
              setLigandoDe(id);
            },
          },
        );
        if (fundo && (c.tipo === "postit" || c.tipo === "pagina")) {
          itens.push({ rotulo: c.formato === "alfinete" ? "Voltar a ser cartão" : "Virar alfinete", icone: "fa-location-dot", aoEscolher: () => alfinete(id, c.formato !== "alfinete") });
        }
      }
      if (quadro.permissoes.ocultar) itens.push({ rotulo: c.oculto ? "Revelar à mesa" : "Ocultar da mesa", icone: c.oculto ? "fa-lock-open" : "fa-lock", aoEscolher: () => ocultar([id], !c.oculto) });
      if (podeEditar) itens.push({ rotulo: "Apagar", icone: "fa-trash", perigo: true, aoEscolher: () => apagar([id]) });
      return { titulo: rotuloDoCartao(c), itens };
    },
    [podeEditar, fundo, rf, criarTexto, criarAlfineteLivre, abrirReferencia, duplicar, alfinete, quadro.permissoes.ocultar, ocultar, apagar, rotuloDoCartao],
  );

  // O que o aviso do modo investigação diz.
  const nomeDoFoco = (id: string | null) => {
    const n = id ? nos.find((x) => x.id === id) : undefined;
    return n ? rotuloDoCartao(n.data.cartao) : "";
  };
  let textoInvestigacao = "Clique num cartão para ver tudo o que se liga a ele.";
  if (investigacao && focoA) {
    if (investigacao.tipo === "grupo") {
      const outros = investigacao.nos.size - 1;
      textoInvestigacao = outros === 0 ? `“${nomeDoFoco(focoA)}” não está ligado a nada.` : `“${nomeDoFoco(focoA)}” se liga a ${outros} ${outros === 1 ? "cartão" : "cartões"}. Clique em outro para ver o caminho até ele.`;
    } else if (investigacao.tipo === "caminho") {
      textoInvestigacao = `Caminho de “${nomeDoFoco(focoA)}” até “${nomeDoFoco(focoB)}”: ${investigacao.passos} ${investigacao.passos === 1 ? "ligação" : "ligações"}.`;
    } else {
      textoInvestigacao = `Não há ligação entre “${nomeDoFoco(focoA)}” e “${nomeDoFoco(focoB)}”.`;
    }
  }

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
      iniciarTamanho,
      salvarTamanho,
      mudarCor,
      formatar,
      podeOcultar,
      ocultar,
      ocultarLigacao,
      ligacaoEsmaecida,
      temMapa: fundo !== null,
      alfinete,
      apagar,
      duplicar,
      abrirReferencia,
      atualizarLigacao,
      apagarLigacao,
      selecionarLigacao,
      ligandoDe,
    }),
    [mesaId, meuId, podeEditar, quadro.autores, paginas, notas, sessoes, editandoId, salvarTexto, iniciarTamanho, salvarTamanho, mudarCor, formatar, podeOcultar, ocultar, ocultarLigacao, ligacaoEsmaecida, fundo, alfinete, apagar, duplicar, abrirReferencia, atualizarLigacao, apagarLigacao, selecionarLigacao, ligandoDe],
  );

  return (
    <QuadroContexto.Provider value={ctx}>
      <div
        ref={area}
        className={`qt-canvas${ligar ? " qt-canvas--ligando" : ""}${gavetaAberta ? " qt-canvas--com-gaveta" : ""}${porAutor ? " qt-canvas--autor" : ""}${investigando ? " qt-canvas--investigando" : ""}`}
        onDragOver={(e) => podeEditar && e.preventDefault()}
        onDrop={aoSoltar}
        onDoubleClick={aoDuploClique}
        onPointerDown={aoPressionar}
        onPointerUp={cancelarToqueLongo}
        onPointerCancel={cancelarToqueLongo}
        onContextMenu={(e) => toque && e.preventDefault()}
        onPointerMove={(e) => {
          moverToqueLongo(e);
          if (e.pointerType === "touch") return;
          const p = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
          enviarCursor(p.x, p.y);
        }}
      >
        <ReactFlow<NoCartao, ArestaLigacao>
          nodes={nosVisiveis}
          edges={arestasVisiveis}
          nodeTypes={TIPOS_NO}
          edgeTypes={TIPOS_ARESTA}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onConnectEnd={onConnectEnd}
          onNodeClick={onNodeClick}
          onPaneClick={aoClicarNoVazio}
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
          nodesDraggable={podeEditar && !investigando}
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
              if (n.type === "mapa") return "transparent";
              const c = (n as NoCartao).data?.cartao;
              return c && (c.tipo === "postit" || c.tipo === "texto" || c.tipo === "moldura") ? COR_MINIMAPA[c.cor] : "var(--primary)";
            }}
            nodeStrokeWidth={0}
          />
          <Cursores barramento={barramento} autores={quadro.autores} />
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
      <Vista
        investigando={investigando}
        aoInvestigar={alternarInvestigacao}
        camada={camada}
        sessoes={ordemSessoes}
        aoCamada={setCamada}
        porAutor={porAutor}
        aoPorAutor={() => setPorAutor((v) => !v)}
        autores={autoresPresentes}
        termo={termo}
        aoTermo={setTermo}
        achados={achados}
        aoIrPara={irPara}
        podeTrocarMapa={quadro.permissoes.trocarFundo}
        temMapa={fundo !== null}
        aoTrocarMapa={(a) => void trocarMapa(a)}
        aoTirarMapa={() => void tirarMapa()}
        enviandoMapa={enviandoMapa}
      />
      <div className="qt-direita">
        <Presenca barramento={barramento} chave={chave} meuId={meuId} autores={quadro.autores} />
        {quadro.permissoes.compartilhar && <Compartilhar mesaId={mesaId} quadroId={quadro.id} meuId={meuId} autores={quadro.autores} />}
        {podeEditar && (
          <Lixeira
            mesaId={mesaId}
            quadroId={quadro.id}
            meuId={meuId}
            autores={quadro.autores}
            aoRestaurar={(cs, ls) => incluirLocal(cs, ls, false)}
          />
        )}
      </div>

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
          {fundo && (
            <button type="button" className="qt-ferr" onClick={() => criarAlfineteLivre()} title="Alfinete no mapa">
              <i className="fas fa-location-dot" /> <span>Alfinete</span>
            </button>
          )}
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

      {quadro.tipo !== "mesa" && <EnviarParaMesa mesaId={mesaId} quadroId={quadro.id} ids={paraEnviar} />}

      {investigando && (
        <div className="qt-invest" role="status">
          <i className="fas fa-user-secret" aria-hidden /> <span>{textoInvestigacao}</span>
          <button type="button" onClick={sairDaInvestigacao}>
            Sair (Esc)
          </button>
        </div>
      )}
      {camada !== null && camada < ordemSessoes.length - 1 && (
        <button type="button" className="qt-camada" onClick={() => setCamada(null)} title="Mostrar tudo">
          <i className="fas fa-layer-group" aria-hidden /> Até {ordemSessoes[camada].numero != null ? `a Sessão ${ordemSessoes[camada].numero}` : rotuloSessao(ordemSessoes[camada])} · mostrar tudo
        </button>
      )}
      {menu && <MenuContexto x={menu.x} y={menu.y} monta={() => itensDoMenu(menu)} aoFechar={() => setMenu(null)} />}

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
