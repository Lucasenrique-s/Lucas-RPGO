"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { Caveat } from "next/font/google";
import { exigir } from "@/lib/acoes";
import { textoPuroRico } from "@/lib/descricao-rica";
import {
  TIPOS_FICHA,
  dataDaSessao,
  rotuloDia,
  rotuloSessao,
  type CalendarioDiarioDTO,
  type FichaDiarioDTO,
  type MencaoDiarioDTO,
  type NotaDiarioDTO,
  type RelacaoDTO,
  type SessaoDiarioDTO,
} from "@/lib/diario-tipos";
import { montarLinha, type SecaoLinha } from "@/lib/diario-linha";
import { DescricaoRica } from "@/components/descricao-rica/descricao-rica";
import type { ContextoRico, OpcaoRef } from "@/components/descricao-rica/atomos";
import type { ConfigMencao, ItemMencao } from "@/lib/diario-mencao";
import { CAPAS, corValida, estiloDaCapa } from "@/lib/diario-capa";
import { ENTRE, EditorComImagem, SeletorSessao, avisar, iconeDoTipo, useSessoesComNovas } from "./diario-partes";
import { BuscaCaderno } from "./caderno-busca";
import { FolhaEntidade } from "./caderno-folha";
import { criarNotaDiario, definirCapaDiario } from "./actions";
import "./caderno.css";

// Letra de mão das anotações (baixada no build, servida do próprio site).
const mao = Caveat({ subsets: ["latin"], weight: ["400", "500"], display: "swap" });

// Margem interna de cada página (px) e largura mínima pra mostrar duas páginas.
const PAD_X = 24;
const PAD_Y = 28;
const LARGURA_DUAS_PAGINAS = 760;
const TEMPO_SAIDA_MS = 520;
const TEMPO_DESLIZE_MS = 460;

// Páginas "lógicas" do livro:
//   -1  a capa;
//    0  (só com duas páginas) a guarda, o verso da capa, em branco;
//   0+off em diante: as colunas do texto (off = 1 com duas páginas, 0 com uma).
// `pag` é a página lógica da esquerda do par aberto. Menor que 0 = capa fechada.
type Dim = { pw: number; ph: number; por: 1 | 2 };
type Estado = { pag: number; ultima: number | null; marcador: number | null };

const chaveEstado = (mesaId: string, meuId: string) => `rpgo:caderno:${mesaId}:${meuId}`;

function lerEstado(mesaId: string, meuId: string): Estado | null {
  try {
    const bruto = window.localStorage.getItem(chaveEstado(mesaId, meuId));
    if (!bruto) return null;
    const v = JSON.parse(bruto) as Partial<Estado>;
    return {
      pag: typeof v.pag === "number" ? v.pag : -2,
      ultima: typeof v.ultima === "number" ? v.ultima : null,
      marcador: typeof v.marcador === "number" ? v.marcador : null,
    };
  } catch {
    return null;
  }
}

function gravarEstado(mesaId: string, meuId: string, e: Estado) {
  try {
    window.localStorage.setItem(chaveEstado(mesaId, meuId), JSON.stringify(e));
  } catch {
    /* sem storage: só não lembra onde parou */
  }
}

const reduzMovimento = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/* ─── O texto do caderno (o mesmo na página e nas faces da folha) ─────── */

type PropsConteudo = {
  secoes: SecaoLinha[];
  grupos: { tipo: (typeof TIPOS_FICHA)[number]; itens: FichaDiarioDTO[] }[];
  calendario: CalendarioDiarioDTO | null;
  contexto: ContextoRico;
  paginaFicha: Record<string, number>;
  // Quantas anotações minhas citam cada página (índice vivo).
  contagem: Record<string, number>;
  aoAbrirFicha: (id: string) => void;
  aoAbrirNota: (id: string) => void;
  // Recebe a coluna do texto (não a página lógica).
  aoIrParaColuna: (coluna: number) => void;
};

const Conteudo = memo(function Conteudo({ secoes, grupos, calendario, contexto, paginaFicha, contagem, aoAbrirFicha, aoAbrirNota, aoIrParaColuna }: PropsConteudo) {
  return (
    <>
      {secoes.map((s) => (
        <section key={s.id} className="cad-secao" data-secao={s.id}>
          <header className="cad-cabeca">
            <h3>{s.sessao ? rotuloSessao(s.sessao) : s.rotulo}</h3>
            {s.sessao && (
              <span className="cad-sub">
                {dataDaSessao(s.sessao) ?? "antes do diário"}
                {s.sessao.ativa ? " · ao vivo" : ""}
              </span>
            )}
          </header>
          {s.itens.length === 0 && <p className="cad-vazio">Nada anotado nesta sessão.</p>}
          {s.itens.map((it) =>
            it.k === "nota" ? (
              <article key={it.id} className="cad-nota" data-nota={it.id}>
                {(it.nota.titulo || it.nota.importante) && (
                  <h4 className="cad-titulo">
                    {it.nota.importante && <i className="fas fa-star cad-estrela" title="Importante" />}
                    {it.nota.titulo}
                  </h4>
                )}
                <DescricaoRica texto={it.nota.corpo} contexto={contexto} />
                <div className="cad-meta">
                  <span>
                    {new Date(it.nota.criadaEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    {calendario && it.nota.diaJogo != null ? ` · ${rotuloDia(it.nota.diaJogo, calendario.config)}` : ""}
                  </span>
                  <button type="button" className="cad-abrir" onClick={() => aoAbrirNota(it.id)} aria-label="Abrir anotação">
                    <i className="fas fa-up-right-from-square" />
                  </button>
                </div>
              </article>
            ) : (
              <article key={it.id} className="cad-ficha" data-ficha={it.id}>
                <div className="cad-moldura cad-moldura--foto">
                  <div className="cad-foto" style={{ background: TIPOS_FICHA.find((t) => t.id === it.ficha.tipo)?.cor }}>
                    {it.ficha.retratos[0]?.url || it.ficha.retratoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={it.ficha.retratos[0]?.url ?? it.ficha.retratoUrl ?? ""} alt="" />
                    ) : (
                      <i className={`fas ${iconeDoTipo(it.ficha.tipo)}`} />
                    )}
                  </div>
                </div>
                <h4 className="cad-titulo">{it.ficha.nome}</h4>
                <div className="cad-sub">
                  {TIPOS_FICHA.find((t) => t.id === it.ficha.tipo)?.nome}
                  {it.ficha.campos.relacao ? ` · ${it.ficha.campos.relacao}` : ""}
                  {it.ficha.campos.status ? ` · ${it.ficha.campos.status}` : ""}
                </div>
                {it.ficha.resumo && <DescricaoRica texto={it.ficha.resumo} contexto={contexto} />}
                <div className="cad-meta">
                  <span />
                  <button type="button" className="cad-abrir" onClick={() => aoAbrirFicha(it.id)}>
                    abrir ficha
                  </button>
                </div>
              </article>
            ),
          )}
        </section>
      ))}

      <section className="cad-secao cad-indice" data-secao="indice">
        <header className="cad-cabeca">
          <h3>Índice</h3>
          <span className="cad-sub">Gente, lugares e coisas deste caderno</span>
        </header>
        {grupos.length === 0 && <p className="cad-vazio">Ainda não há fichas.</p>}
        {grupos.map((g) => (
          <div key={g.tipo.id} className="cad-grupo">
            <h4>
              <i className={`fas ${g.tipo.icone}`} /> {g.tipo.plural}
            </h4>
            {g.itens.map((f) => (
              <button key={f.id} type="button" className="cad-linha-indice" onClick={() => paginaFicha[f.id] !== undefined && aoIrParaColuna(paginaFicha[f.id])}>
                <span>
                  {f.nome}
                  {contagem[f.id] ? <small className="cad-indice-qtd"> · {contagem[f.id]}</small> : null}
                </span>
                <i className="cad-pontos" />
                <span>{paginaFicha[f.id] !== undefined ? paginaFicha[f.id] + 1 : ""}</span>
              </button>
            ))}
          </div>
        ))}
      </section>
    </>
  );
});

/* ─── Páginas "soltas" (usadas nas faces da folha e nas bases) ─────────── */

// O texto da coluna `col` numa página inteira: o texto fica de fato na folha.
function PaginaColuna({ col, num, dim, conteudo }: { col: number; num: number; dim: Dim; conteudo: ReactNode }) {
  const larguraJanela = dim.pw * dim.por - 2 * PAD_X;
  return (
    <div className="cad-pg" style={{ width: dim.pw, height: dim.ph }}>
      <div className="cad-janela cad-janela--clone" style={{ width: dim.pw - 2 * PAD_X, height: dim.ph - 2 * PAD_Y }}>
        <div
          className="cad-fluxo"
          style={{
            transform: `translate3d(${-col * dim.pw}px,0,0)`,
            width: larguraJanela,
            height: dim.ph - 2 * PAD_Y,
            columnWidth: dim.pw - 2 * PAD_X,
            columnGap: 2 * PAD_X,
          }}
        >
          {conteudo}
        </div>
      </div>
      <span className="cad-num">{num}</span>
    </div>
  );
}

function PaginaPapel({ dim }: { dim: Dim }) {
  return <div className="cad-pg" style={{ width: dim.pw, height: dim.ph }} />;
}

// A capa: a primeira página do livro.
function PaginaCapa({ dim, titulo }: { dim: Dim; titulo: string }) {
  return (
    <div className="cad-pg cad-pg--capa" style={{ width: dim.pw, height: dim.ph }}>
      <span className="cad-capa-etiqueta">
        <small>Diário de bordo</small>
        <strong>{titulo}</strong>
      </span>
      <span className="cad-capa-dica">toque para abrir</span>
    </div>
  );
}

// A página de escrever, só pra ver: o editor de verdade fica fora da folha (ele usa
// posição fixa e não pode girar), então nas faces entra este desenho igual a ele.
function PaginaEscreverFixa({ dim, rotulo, titulo, texto }: { dim: Dim; rotulo: string; titulo: string; texto: string }) {
  return (
    <div className="cad-pg" style={{ width: dim.pw, height: dim.ph }}>
      <div className="cad-escrever cad-escrever--fixa" style={{ left: PAD_X, top: PAD_Y, width: dim.pw - 2 * PAD_X, height: dim.ph - 2 * PAD_Y }}>
        <h3 className="cad-sessao-fixa">{rotulo}</h3>
        <div className={`cad-titulo-campo${titulo ? "" : " cad-titulo-campo--vazio"}`}>{titulo || "Título (opcional)"}</div>
        <div className="cad-texto-fixo">{texto ? textoPuroRico(texto) : ""}</div>
        <span className="cad-salvar">Guardar no caderno</span>
      </div>
    </div>
  );
}

type Anim = { dir: 1 | -1; de: number; alvo: number; id: number };

export function Caderno({
  mesaId,
  meuId,
  titulo,
  capaCor,
  fichas,
  notas,
  sessoes,
  calendario,
  contexto,
  refs,
  cfg,
  mencoes,
  relacoes,
  folhaId,
  somenteLeitura,
  pedidoSair,
  aoAbrirFicha,
  aoFecharFolha,
  aoAbrirCompleta,
  aoVerNaWiki,
  aoAbrirNota,
  aoSalvou,
  aoSair,
}: {
  mesaId: string;
  meuId: string;
  // Quem escreve o caderno (nome na capa).
  titulo: string;
  // Cor da capa (#rrggbb) escolhida por quem escreve o caderno.
  capaCor: string;
  fichas: FichaDiarioDTO[];
  notas: NotaDiarioDTO[];
  sessoes: SessaoDiarioDTO[];
  calendario: CalendarioDiarioDTO | null;
  contexto: ContextoRico;
  refs: OpcaoRef[];
  cfg: ConfigMencao;
  mencoes: MencaoDiarioDTO[];
  relacoes: RelacaoDTO[];
  // Página de entidade aberta na folha da direita (null = o texto).
  folhaId: string | null;
  somenteLeitura: boolean;
  // Quando muda, o caderno desce da tela e chama `aoSair`.
  pedidoSair: number;
  // Abre a folha da entidade (a ficha completa é `aoAbrirCompleta`).
  aoAbrirFicha: (id: string) => void;
  aoFecharFolha: () => void;
  aoAbrirCompleta: (id: string) => void;
  // A página é pública: abre a mesma página na wiki.
  aoVerNaWiki: (id: string) => void;
  aoAbrirNota: (id: string) => void;
  aoSalvou: () => void;
  aoSair: () => void;
}) {
  const bookRef = useRef<HTMLDivElement>(null);
  const fluxoRef = useRef<HTMLDivElement>(null);
  const [dim, setDim] = useState<Dim>({ pw: 340, ph: 480, por: 2 });
  const [paginas, setPaginas] = useState(1);
  const [inicioSecao, setInicioSecao] = useState<Record<string, number>>({});
  const [paginaFicha, setPaginaFicha] = useState<Record<string, number>>({});
  const [paginaNota, setPaginaNota] = useState<Record<string, number>>({});
  const [medido, setMedido] = useState(false);
  const [pag, setPag] = useState(-2);
  const [ultima, setUltima] = useState<number | null>(null);
  const [marcador, setMarcador] = useState<number | null>(null);
  const [anim, setAnim] = useState<Anim | null>(null);
  const [saindo, setSaindo] = useState(false);
  const [arrasto, setArrasto] = useState<number | null>(null);
  const [desliza, setDesliza] = useState(false);
  const iniciou = useRef(false);
  const aoIrParaNova = useRef(false);

  // Só o que é meu: o caderno é o Meu diário.
  const minhasFichas = useMemo(() => fichas.filter((f) => f.autorId === meuId), [fichas, meuId]);
  const minhasNotas = useMemo(() => notas.filter((n) => n.autorId === meuId), [notas, meuId]);
  // Do mais antigo ao mais novo, como se lê um diário.
  // Sessão sem nada anotado não ganha página (senão viram dez "nada anotado" seguidos);
  // a sessão ao vivo fica, pra página de escrever ter onde se apoiar.
  const secoes = useMemo(
    () => montarLinha(sessoes, minhasFichas, minhasNotas).reverse().filter((s) => s.itens.length > 0 || s.sessao?.ativa),
    [sessoes, minhasFichas, minhasNotas],
  );
  const ativa = sessoes.find((s) => s.ativa) ?? null;
  const folhaFicha = folhaId ? (fichas.find((f) => f.id === folhaId) ?? null) : null;

  // Com duas páginas, a guarda (verso da capa) ocupa a página lógica 0.
  const off = dim.por === 2 ? 1 : 0;
  const capaLogica = -1;
  const fechada = pag < 0;

  /* ─── Medidas ─────────────────────────────────────────── */

  useEffect(() => {
    const el = bookRef.current;
    if (!el) return;
    const medirLivro = () => {
      const largura = el.clientWidth;
      const por: 1 | 2 = largura >= LARGURA_DUAS_PAGINAS ? 2 : 1;
      // Descontam a moldura do caderno.
      const miolo = largura - 24;
      const pw = Math.max(240, Math.floor(miolo / por));
      const ph = Math.round(Math.min(640, Math.max(440, window.innerHeight - 230)));
      setDim((d) => (d.pw === pw && d.ph === ph && d.por === por ? d : { pw, ph, por }));
    };
    medirLivro();
    const ro = new ResizeObserver(medirLivro);
    ro.observe(el);
    window.addEventListener("resize", medirLivro);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", medirLivro);
    };
  }, []);

  // Quantas páginas o texto ocupa e onde começa cada sessão, ficha e anotação.
  const medir = useCallback(() => {
    const el = fluxoRef.current;
    if (!el) return;
    const { pw } = dim;
    const gap = 2 * PAD_X;
    const n = Math.max(1, Math.round((el.scrollWidth + gap) / pw));
    const coluna = (e: HTMLElement) => Math.max(0, Math.round(e.offsetLeft / pw));
    const ini: Record<string, number> = {};
    const fic: Record<string, number> = {};
    const not: Record<string, number> = {};
    el.querySelectorAll<HTMLElement>("[data-secao]").forEach((e) => (ini[e.dataset.secao!] = coluna(e)));
    el.querySelectorAll<HTMLElement>("[data-ficha]").forEach((e) => (fic[e.dataset.ficha!] = coluna(e)));
    el.querySelectorAll<HTMLElement>("[data-nota]").forEach((e) => (not[e.dataset.nota!] = coluna(e)));
    const igual = (a: Record<string, number>, b: Record<string, number>) =>
      Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((k) => a[k] === b[k]);
    setPaginas((p) => (p === n ? p : n));
    setInicioSecao((a) => (igual(a, ini) ? a : ini));
    setPaginaFicha((a) => (igual(a, fic) ? a : fic));
    setPaginaNota((a) => (igual(a, not) ? a : not));
    setMedido(true);
  }, [dim]);

  useEffect(() => {
    const t = window.setTimeout(medir, 0);
    // A letra de mão carrega depois: refaz a conta quando ela chegar.
    void document.fonts?.ready.then(() => window.setTimeout(medir, 0));
    return () => window.clearTimeout(t);
  }, [medir, secoes, paginaFicha]);

  // Páginas lógicas de conteúdo: guarda + colunas + a página de escrever.
  const escreverLogica = paginas + off;
  const totalLogico = escreverLogica + 1;
  const ultimaEsquerda = Math.floor((totalLogico - 1) / dim.por) * dim.por;
  const capaPag = -dim.por;
  const alinha = useCallback(
    (p: number) => (p < 0 ? -dim.por : Math.min(ultimaEsquerda, Math.floor(p / dim.por) * dim.por)),
    [dim.por, ultimaEsquerda],
  );

  /* ─── Onde abrir ──────────────────────────────────────── */

  // Mudou o número de páginas por vez (girou o celular, redimensionou): realinha o par.
  useEffect(() => {
    const t = window.setTimeout(() => {
      setPag((p) => alinha(p));
      setUltima((u) => (u === null ? u : alinha(Math.max(0, u))));
    }, 0);
    return () => window.clearTimeout(t);
  }, [alinha]);

  useEffect(() => {
    if (!medido || iniciou.current) return;
    iniciou.current = true;
    const guardado = lerEstado(mesaId, meuId);
    const colAtiva = ativa ? inicioSecao[`sessao-${ativa.id}`] : undefined;
    const t = window.setTimeout(() => {
      const retomar = alinha(guardado?.ultima ?? (colAtiva !== undefined ? colAtiva + off : ultimaEsquerda));
      setUltima(retomar);
      setMarcador(guardado?.marcador ?? null);
      // Quem deixou o caderno aberto volta nele; senão, começa pela capa.
      setPag(guardado && guardado.pag >= 0 ? alinha(guardado.pag) : capaPag);
    }, 0);
    return () => window.clearTimeout(t);
  }, [medido, mesaId, meuId, ativa, inicioSecao, alinha, off, ultimaEsquerda, capaPag]);

  useEffect(() => {
    if (iniciou.current) gravarEstado(mesaId, meuId, { pag, ultima, marcador });
  }, [mesaId, meuId, pag, ultima, marcador]);

  // Anotação nova escrita no caderno: vai até a página dela quando chega do servidor.
  const idUltimaNota = useMemo(() => [...minhasNotas].sort((a, b) => b.criadaEm.localeCompare(a.criadaEm))[0]?.id, [minhasNotas]);

  /* ─── Virar página (a capa também é uma página) ────────── */

  const virarPara = useCallback(
    (destino: number) => {
      const alvo = alinha(destino);
      if (alvo === pag || anim) return;
      // Virar a página volta ao texto.
      if (folhaId) aoFecharFolha();
      // Ao fechar, lembra a página onde parou.
      if (alvo < 0 && pag >= 0) setUltima(pag);
      if (reduzMovimento()) {
        setPag(alvo);
        return;
      }
      setAnim({ dir: alvo > pag ? 1 : -1, de: pag, alvo, id: Date.now() });
    },
    [alinha, pag, anim, folhaId, aoFecharFolha],
  );

  // Vai pra uma coluna do texto (alinha ao par que a contém).
  const irParaColuna = useCallback((coluna: number) => virarPara(coluna + off), [virarPara, off]);

  useEffect(() => {
    if (!aoIrParaNova.current || !idUltimaNota || paginaNota[idUltimaNota] === undefined) return;
    aoIrParaNova.current = false;
    const destino = paginaNota[idUltimaNota] + off;
    const t = window.setTimeout(() => virarPara(destino), 150);
    return () => window.clearTimeout(t);
  }, [idUltimaNota, paginaNota, off, virarPara]);

  // A folha pousou: a página de baixo já é a nova, então a troca não se nota.
  const terminarVirada = useCallback(() => {
    setAnim((a) => {
      if (a) setPag(a.alvo);
      return null;
    });
  }, []);

  // Rede de segurança: se o navegador não disparar o fim da animação, termina assim mesmo.
  useEffect(() => {
    if (!anim) return;
    const t = window.setTimeout(terminarVirada, 1800);
    return () => window.clearTimeout(t);
  }, [anim, terminarVirada]);

  // Da capa, "próxima" abre onde parou; "anterior" da primeira página leva à capa.
  const proxima = useCallback(() => virarPara(fechada ? (ultima ?? 0) : pag + dim.por), [virarPara, fechada, ultima, pag, dim.por]);
  const anterior = useCallback(() => virarPara(pag - dim.por), [virarPara, pag, dim.por]);

  const guardar = useCallback(() => {
    if (reduzMovimento()) return aoSair();
    setSaindo(true);
    window.setTimeout(aoSair, TEMPO_SAIDA_MS);
  }, [aoSair]);

  // O botão de trocar de modo (fora do caderno) pede pra descer.
  const pedidoAnterior = useRef(pedidoSair);
  useEffect(() => {
    if (pedidoAnterior.current === pedidoSair) return;
    pedidoAnterior.current = pedidoSair;
    const t = window.setTimeout(guardar, 0);
    return () => window.clearTimeout(t);
  }, [pedidoSair, guardar]);

  /* ─── Folhear rápido ─────────────────────────────────────
     Num diário grande, virar página por página não basta: segurar a seta (ou a tecla),
     PageUp/PageDown e a régua embaixo passam muitas páginas sem a animação da folha. */

  const pagRef = useRef(pag);
  useEffect(() => {
    pagRef.current = pag;
  }, [pag]);
  const limiteRef = useRef({ por: dim.por, ultimaEsquerda });
  useEffect(() => {
    limiteRef.current = { por: dim.por, ultimaEsquerda };
  }, [dim.por, ultimaEsquerda]);

  // Vai direto pra uma página (sem a folha girar). Só com o livro aberto.
  const irDireto = useCallback(
    (destino: number) => {
      const { por, ultimaEsquerda: fim } = limiteRef.current;
      const atual = pagRef.current;
      if (atual < 0) return;
      const alvo = Math.max(0, Math.min(fim, Math.floor(destino / por) * por));
      if (alvo === atual) return;
      pagRef.current = alvo;
      setPag(alvo);
      if (folhaId) aoFecharFolha();
    },
    [folhaId, aoFecharFolha],
  );
  const folhear = useCallback((dir: 1 | -1, paginas = 1) => irDireto(pagRef.current + dir * paginas * limiteRef.current.por), [irDireto]);

  // Segurar o botão da seta: depois de um instante, passa as páginas em sequência.
  const seguro = useRef<{ espera: number; passo: number; rapido: boolean } | null>(null);
  const soltarSeta = useCallback(() => {
    const s = seguro.current;
    if (!s) return;
    window.clearTimeout(s.espera);
    window.clearInterval(s.passo);
    // O clique que vem depois de um folheio não vira outra página.
    window.setTimeout(() => (seguro.current = null), 0);
  }, []);
  function segurarSeta(dir: 1 | -1) {
    if (anim || fechada) return;
    const s = { espera: 0, passo: 0, rapido: false };
    seguro.current = s;
    s.espera = window.setTimeout(() => {
      s.rapido = true;
      folhear(dir);
      s.passo = window.setInterval(() => folhear(dir), 110);
    }, 450);
  }
  function cliqueSeta(dir: 1 | -1) {
    if (seguro.current?.rapido) return;
    if (dir > 0) proxima();
    else anterior();
  }
  useEffect(() => soltarSeta, [soltarSeta]);

  // Setas do teclado (fora de campos de texto). Segurar a tecla folheia; PageUp/PageDown pulam 10.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(alvo.tagName))) return;
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        const dir = e.key === "ArrowRight" ? 1 : -1;
        if (e.repeat) folhear(dir);
        else if (dir > 0) proxima();
        else anterior();
      } else if (e.key === "PageDown" || e.key === "PageUp") {
        e.preventDefault();
        folhear(e.key === "PageDown" ? 1 : -1, 10);
      } else if (e.key === "Home" || e.key === "End") {
        if (pagRef.current < 0) return;
        e.preventDefault();
        irDireto(e.key === "Home" ? 0 : limiteRef.current.ultimaEsquerda);
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [proxima, anterior, folhear, irDireto]);

  /* ─── Arrastar com o dedo ──────────────────────────────── */

  const inicioArrasto = useRef<{ x: number; id: number } | null>(null);
  // O deslocamento mais recente (o estado só serve pra desenhar; o soltar lê daqui).
  const dxAtual = useRef<number | null>(null);
  function aoPressionar(e: ReactPointerEvent<HTMLDivElement>) {
    // Só toque e caneta: com o mouse o clique e a seleção de texto seguem normais.
    if (e.pointerType === "mouse" || fechada || anim) return;
    inicioArrasto.current = { x: e.clientX, id: e.pointerId };
    dxAtual.current = null;
  }
  function aoMover(e: ReactPointerEvent<HTMLDivElement>) {
    const ini = inicioArrasto.current;
    if (!ini || ini.id !== e.pointerId) return;
    const dx = e.clientX - ini.x;
    if (dxAtual.current === null && Math.abs(dx) < 10) return;
    dxAtual.current = dx;
    setArrasto(dx);
  }
  function aoSoltar() {
    const ini = inicioArrasto.current;
    inicioArrasto.current = null;
    const dx = dxAtual.current;
    dxAtual.current = null;
    if (!ini || dx === null) return;
    setArrasto(null);
    const limiar = dim.pw * 0.2;
    // Arrastar pra trás a partir da primeira página volta à capa (com a folha).
    if (dx > limiar && pag <= 0) return virarPara(capaPag);
    let alvo = pag;
    if (dx < -limiar && pag + dim.por <= ultimaEsquerda) alvo = alinha(pag + dim.por);
    else if (dx > limiar && pag > 0) alvo = alinha(pag - dim.por);
    // Soltou: a página termina o caminho deslizando (sem a folha).
    setDesliza(true);
    setPag(alvo);
    window.setTimeout(() => setDesliza(false), TEMPO_DESLIZE_MS);
  }

  /* ─── Cor da capa ──────────────────────────────────────── */

  // A cor escolhida aparece na hora; o servidor recebe depois (o seletor livre dispara
  // vários valores por segundo ao arrastar). Falhou: volta à cor que veio do servidor.
  const [corLocal, setCorLocal] = useState<string | null>(null);
  const cor = corLocal ?? capaCor;
  const timerCor = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timerCor.current), []);
  function escolherCor(nova: string, esperar = 0) {
    if (somenteLeitura || !corValida(nova)) return;
    setCorLocal(nova);
    window.clearTimeout(timerCor.current);
    timerCor.current = window.setTimeout(async () => {
      try {
        exigir(await definirCapaDiario(mesaId, nova));
      } catch (e) {
        setCorLocal(null);
        avisar(e instanceof Error ? e.message : "Falha ao salvar a cor da capa.");
      }
    }, esperar);
  }

  /* ─── Escrever na página em branco ─────────────────────── */

  const [tituloNovo, setTituloNovo] = useState("");
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);
  // A sessão da anotação: a que a pessoa escolheu; senão a ao vivo; senão "Entre sessões".
  // Escolher uma sessão anterior ao sistema registra a sessão na hora.
  const { todas: todasSessoes, adicionar: adicionarSessao } = useSessoesComNovas(sessoes);
  const [sessaoEscolhida, setSessaoEscolhida] = useState<string | null>(null);
  const sessaoEscrever = sessaoEscolhida && (sessaoEscolhida === ENTRE || todasSessoes.some((s) => s.id === sessaoEscolhida))
    ? sessaoEscolhida
    : (ativa?.id ?? ENTRE);
  async function salvar() {
    if (!texto.trim() || salvando) return;
    setSalvando(true);
    try {
      exigir(
        await criarNotaDiario(mesaId, {
          titulo: tituloNovo,
          corpo: texto.trim(),
          sessaoId: sessaoEscrever === ENTRE ? null : sessaoEscrever,
        }),
      );
      setTexto("");
      setTituloNovo("");
      aoIrParaNova.current = true;
      aoSalvou();
    } catch (e) {
      avisar(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  /* ─── Peças do caderno ─────────────────────────────────── */

  const grupos = useMemo(
    () =>
      TIPOS_FICHA.map((t) => ({ tipo: t, itens: minhasFichas.filter((f) => f.tipo === t.id) })).filter((g) => g.itens.length > 0),
    [minhasFichas],
  );

  // Abre a folha da entidade; com o caderno fechado, abre o livro junto.
  const abrirFolha = useCallback(
    (id: string) => {
      if (fechada) proxima();
      aoAbrirFicha(id);
    },
    [fechada, proxima, aoAbrirFicha],
  );

  const contagem = useMemo(() => {
    const minhas = new Set(minhasNotas.map((n) => n.id));
    const c: Record<string, number> = {};
    for (const m of mencoes) if (m.origemTipo === "nota" && m.alvoTipo === "ficha" && minhas.has(m.origemId)) c[m.alvoId] = (c[m.alvoId] ?? 0) + 1;
    return c;
  }, [mencoes, minhasNotas]);

  // Resultado de tempo da busca: sessão vai pro começo dela; data ou evento, pra primeira anotação do dia.
  const irParaTempo = useCallback(
    (item: ItemMencao) => {
      if (item.ref.tipo === "sessao") {
        const col = inicioSecao[`sessao-${item.ref.id}`];
        if (col === undefined) return avisar("Essa sessão não tem anotações suas no caderno.");
        return irParaColuna(col);
      }
      const dias = item.ref.tipo === "evento" ? cfg.eventos.find((e) => e.id === item.ref.id)?.dataDias : Number(item.ref.id);
      const nota = dias === undefined ? undefined : minhasNotas.find((n) => n.diaJogo === dias && paginaNota[n.id] !== undefined);
      if (!nota) return avisar(`Você não anotou nada em ${item.detalhe ?? item.rotulo}.`);
      irParaColuna(paginaNota[nota.id]);
    },
    [inicioSecao, paginaNota, minhasNotas, cfg.eventos, irParaColuna],
  );

  // O texto, montado uma vez: a página e as faces da folha usam o mesmo elemento.
  const conteudo = useMemo(
    () => (
      <Conteudo
        secoes={secoes}
        grupos={grupos}
        calendario={calendario}
        contexto={contexto}
        paginaFicha={paginaFicha}
        contagem={contagem}
        aoAbrirFicha={abrirFolha}
        aoAbrirNota={aoAbrirNota}
        aoIrParaColuna={irParaColuna}
      />
    ),
    [secoes, grupos, calendario, contexto, paginaFicha, contagem, abrirFolha, aoAbrirNota, irParaColuna],
  );

  const sessaoDaEscrita = todasSessoes.find((s) => s.id === sessaoEscrever);
  const rotuloEscrever = sessaoDaEscrita ? rotuloSessao(sessaoDaEscrita) : "Entre sessões";

  // O que cada página lógica mostra quando a folha está virando.
  const paginaLogica = useCallback(
    (l: number): ReactNode => {
      if (l === capaLogica) return <PaginaCapa dim={dim} titulo={titulo} />;
      const col = l - off;
      if (l < 0) return null; // fora do livro: aparece a moldura escura
      if (col >= 0 && col < paginas) return <PaginaColuna col={col} num={col + 1} dim={dim} conteudo={conteudo} />;
      if (col === paginas && !somenteLeitura) return <PaginaEscreverFixa dim={dim} rotulo={rotuloEscrever} titulo={tituloNovo} texto={texto} />;
      return <PaginaPapel dim={dim} />;
    },
    [capaLogica, dim, titulo, off, paginas, conteudo, somenteLeitura, rotuloEscrever, tituloNovo, texto],
  );

  // Seções que viram abas, em ordem; `inicio` é a página lógica onde começam.
  const abas = useMemo(() => {
    const lista: { id: string; curto: string; longo: string; inicio: number }[] = [];
    for (const s of secoes) {
      const col = inicioSecao[s.id];
      if (col === undefined) continue;
      const curto = s.sessao ? (s.sessao.numero != null ? `${s.sessao.numero}` : new Date(s.sessao.iniciadaEm).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })) : "…";
      const longo = s.sessao ? (s.sessao.numero != null ? `Sessão ${s.sessao.numero}` : rotuloSessao(s.sessao)) : s.rotulo;
      lista.push({ id: s.id, curto, longo, inicio: col + off });
    }
    const ind = inicioSecao["indice"];
    if (ind !== undefined) lista.push({ id: "indice", curto: "Índice", longo: "Índice", inicio: ind + off });
    if (!somenteLeitura) lista.push({ id: "escrever", curto: "✎", longo: "Escrever", inicio: escreverLogica });
    return lista;
  }, [secoes, inicioSecao, off, escreverLogica, somenteLeitura]);

  // A aba atual é a da seção em que está a página da esquerda (a da direita, na capa).
  // Com a guarda na esquerda (primeiro par), vale a página da direita.
  const refAba = Math.max(pag, off);
  const atualId = [...abas].reverse().find((a) => a.inicio <= refAba)?.id;

  const estiloLivro = {
    "--pw": `${dim.pw}px`,
    "--ph": `${dim.ph}px`,
    "--padx": `${PAD_X}px`,
    "--pady": `${PAD_Y}px`,
    "--por": dim.por,
  } as CSSProperties;
  const janelaLargura = dim.pw * dim.por - 2 * PAD_X;
  // A faixa mostra as colunas a partir da da esquerda (a guarda é a coluna -1).
  const deslocamento = -(pag - off) * dim.pw + (arrasto ?? 0);
  const escreveVisivel = !somenteLeitura && !anim && !fechada && escreverLogica >= pag && escreverLogica <= pag + dim.por - 1;
  const escreveX = (escreverLogica - pag) * dim.pw;

  // Para onde a folha vai: o par de páginas que ficam embaixo e as duas faces dela.
  const plano = (() => {
    if (!anim) return null;
    const { dir, de, alvo } = anim;
    if (dim.por === 2) {
      return dir > 0
        ? { esq: de, dirBase: alvo + 1, frente: de + 1, verso: alvo }
        : { esq: alvo, dirBase: de + 1, frente: de, verso: alvo + 1 };
    }
    return { esq: alvo, dirBase: null, frente: de, verso: null };
  })();

  // Sem animação em andamento, a capa fechada é só a capa; com a folha virando, o livro já está aberto.
  const mostrarFechada = fechada && !anim;
  // Enquanto a capa abre ou fecha, nada de abas, fita nem setas por cima dela.
  const capaEmJogo = fechada || (!!anim && (anim.de < 0 || anim.alvo < 0));

  const classe = [
    "caderno",
    mao.className,
    mostrarFechada ? "caderno--fechado" : "caderno--aberto",
    // Moldura pela metade com a capa fechada, enquanto ela ainda abre e assim que começa a fechar:
    // a esquerda só aparece com o livro aberto de verdade.
    fechada || (!!anim && anim.alvo < 0) ? "caderno--meia" : "",
    // Capa fechada fica no centro; ao abrir o livro desliza pro lado junto com a capa (e volta ao fechar).
    (anim ? anim.alvo < 0 : fechada) ? "caderno--centrada" : "",
    anim ? "caderno--virando" : "",
    saindo ? "caderno--desce" : "caderno--sobe",
    dim.por === 1 ? "caderno--uma" : "",
  ]
    .filter(Boolean)
    .join(" ");

  // Alturas das abas: cabem todas na borda do livro.
  const alturaAba = Math.max(26, Math.min(54, Math.floor((dim.ph - 60) / Math.max(1, abas.length))));

  return (
    <div className={classe} ref={bookRef} style={estiloDaCapa(cor) as CSSProperties}>
      <BuscaCaderno
        mesaId={mesaId}
        cfg={cfg}
        contagem={contagem}
        podeCriar={!somenteLeitura}
        aoAbrirFicha={abrirFolha}
        aoIrTempo={irParaTempo}
        aoCriou={(id) => {
          aoSalvou();
          abrirFolha(id);
        }}
      />
      <div className="cad-livro" style={estiloLivro}>
        <div className="cad-folhas" style={{ width: dim.pw * dim.por, height: dim.ph }}>
          {mostrarFechada && (
            <button type="button" className="cad-capa-estatica" style={{ left: dim.por === 2 ? dim.pw : 0, width: dim.pw, height: dim.ph }} onClick={proxima} aria-label="Abrir o caderno">
              <PaginaCapa dim={dim} titulo={titulo} />
            </button>
          )}
          {/* O texto fica montado (invisível) também com o caderno fechado: é dele que saem
              as medidas das páginas, das sessões e das abas. */}
          {(
            <div className={`cad-papel${anim ? "" : " cad-papel--aberto"}${mostrarFechada ? " cad-papel--oculto" : ""}`} style={{ height: dim.ph }}>
              <div
                className={`cad-janela${anim ? " cad-janela--escondida" : ""}`}
                style={{ width: janelaLargura, height: dim.ph - 2 * PAD_Y }}
                onPointerDown={aoPressionar}
                onPointerMove={aoMover}
                onPointerUp={aoSoltar}
                onPointerCancel={aoSoltar}
              >
                <div
                  ref={fluxoRef}
                  className={`cad-fluxo${desliza ? " cad-fluxo--desliza" : ""}`}
                  style={{
                    transform: `translate3d(${deslocamento}px,0,0)`,
                    width: janelaLargura,
                    height: dim.ph - 2 * PAD_Y,
                    columnWidth: dim.pw - 2 * PAD_X,
                    columnGap: 2 * PAD_X,
                  }}
                  onLoadCapture={medir}
                >
                  {conteudo}
                </div>

                {escreveVisivel && (
                  <div className="cad-escrever" style={{ left: escreveX, width: dim.pw - 2 * PAD_X }}>
                    <h3>
                      <SeletorSessao
                        mesaId={mesaId}
                        sessoes={todasSessoes}
                        valor={sessaoEscrever}
                        aoMudar={setSessaoEscolhida}
                        aoRegistrar={adicionarSessao}
                        className="cad-sessao-sel"
                      />
                    </h3>
                    <input
                      className="cad-titulo-campo"
                      type="text"
                      maxLength={80}
                      placeholder="Título (opcional)"
                      value={tituloNovo}
                      onChange={(e) => setTituloNovo(e.target.value)}
                      aria-label="Título da anotação"
                    />
                    <EditorComImagem
                      mesaId={mesaId}
                      meuId={meuId}
                      valor={texto}
                      onChange={setTexto}
                      refs={refs}
                      cfg={cfg}
                      contexto={contexto}
                      placeholder="Escreva aqui… (@ menciona, cole imagens)"
                    />
                    <button type="button" className="cad-salvar" onClick={() => void salvar()} disabled={salvando || !texto.trim()}>
                      {salvando ? "Guardando…" : "Guardar no caderno"}
                    </button>
                  </div>
                )}
              </div>

              {!anim && (
                <>
                  {pag - off >= 0 && pag - off <= paginas && <span className="cad-num cad-num--esq">{pag - off + 1}</span>}
                  {dim.por === 2 && pag + 1 - off >= 0 && pag + 1 - off <= paginas && <span className="cad-num cad-num--dir">{pag + 1 - off + 1}</span>}
                </>
              )}
              {dim.por === 2 && !anim && <div className="cad-lombada" aria-hidden />}

              {folhaFicha && !anim && !fechada && (
                <div className="cad-folha-ent-pg" style={{ left: dim.por === 2 ? dim.pw : 0, width: dim.pw, height: dim.ph }}>
                  <FolhaEntidade
                    ficha={folhaFicha}
                    fichas={fichas}
                    notas={minhasNotas}
                    sessoes={sessoes}
                    mencoes={mencoes}
                    relacoes={relacoes}
                    contexto={contexto}
                    paginaNota={paginaNota}
                    aoAbrirFicha={abrirFolha}
                    aoIrNota={(id) => paginaNota[id] !== undefined && irParaColuna(paginaNota[id])}
                    aoAbrirCompleta={aoAbrirCompleta}
                    aoVerNaWiki={aoVerNaWiki}
                    aoVoltar={aoFecharFolha}
                  />
                </div>
              )}

              {anim && plano && (
                <div className="cad-anim" key={anim.id} aria-hidden>
                  <div className="cad-base" style={{ width: dim.pw, left: 0 }}>
                    {paginaLogica(plano.esq)}
                  </div>
                  {dim.por === 2 && plano.dirBase !== null && (
                    <div className="cad-base" style={{ width: dim.pw, left: dim.pw }}>
                      {paginaLogica(plano.dirBase)}
                    </div>
                  )}
                  <div className="cad-lombada" />
                  <div
                    className={`cad-folha cad-folha--${anim.dir > 0 ? "vai" : "volta"}`}
                    style={{ width: dim.pw, left: dim.por === 2 && anim.dir > 0 ? dim.pw : 0 }}
                    onAnimationEnd={(e) => e.target === e.currentTarget && terminarVirada()}
                  >
                    <div className="cad-face cad-face--frente">
                      {paginaLogica(plano.frente)}
                      <span className="cad-sombra" />
                    </div>
                    <div className="cad-face cad-face--verso">
                      {plano.verso !== null ? paginaLogica(plano.verso) : <PaginaPapel dim={dim} />}
                      <span className="cad-sombra" />
                    </div>
                  </div>
                </div>
              )}

              {!capaEmJogo && (
              <button
                type="button"
                className="cad-fita-marcadora"
                onClick={() => (marcador !== null && marcador !== pag ? virarPara(marcador) : setMarcador(pag))}
                title={marcador !== null && marcador !== pag ? "Ir para o marcador" : "Marcar esta página"}
                aria-label={marcador !== null && marcador !== pag ? "Ir para o marcador" : "Marcar esta página"}
              />
              )}
            </div>
          )}
        </div>

        {/* Divisórias: as seções que já passaram ficam na borda esquerda, as que vêm ainda, na direita. */}
        {!capaEmJogo && (
          <div className="cad-abas" aria-label="Seções do caderno">
            {abas.map((a, i) => {
              const atras = a.inicio <= refAba;
              const atual = a.id === atualId;
              return (
                <button
                  key={a.id}
                  type="button"
                  className={`cad-aba cad-aba--${atras ? "esq" : "dir"}${atual ? " cad-aba--atual" : ""}`}
                  style={{ top: 16 + i * alturaAba, height: atual ? Math.max(alturaAba, 110) : alturaAba - 3, zIndex: atual ? 3 : 1 }}
                  onClick={() => virarPara(a.inicio)}
                  title={a.longo}
                  aria-label={`Ir para ${a.longo}`}
                >
                  {atual ? a.longo : a.curto}
                </button>
              );
            })}
          </div>
        )}

        {!capaEmJogo && (
          <>
            <button
              type="button"
              className="cad-seta cad-seta--esq"
              onClick={() => cliqueSeta(-1)}
              onPointerDown={() => segurarSeta(-1)}
              onPointerUp={soltarSeta}
              onPointerLeave={soltarSeta}
              onPointerCancel={soltarSeta}
              disabled={!!anim} aria-label={pag <= 0 ? "Voltar à capa" : "Página anterior"}>
              <i className="fas fa-chevron-left" />
            </button>
            <button
              type="button"
              className="cad-seta cad-seta--dir"
              onClick={() => cliqueSeta(1)}
              onPointerDown={() => segurarSeta(1)}
              onPointerUp={soltarSeta}
              onPointerLeave={soltarSeta}
              onPointerCancel={soltarSeta}
              disabled={pag + dim.por > ultimaEsquerda || !!anim} aria-label="Próxima página">
              <i className="fas fa-chevron-right" />
            </button>
          </>
        )}
      </div>

      {/* Régua: arrasta pra passar muitas páginas de uma vez. */}
      {!capaEmJogo && !anim && ultimaEsquerda >= dim.por * 2 && (
        <div className="cad-regua">
          <span>{pag - off + 1 > 0 ? pag - off + 1 : 1}</span>
          <input
            type="range"
            min={0}
            max={ultimaEsquerda}
            step={dim.por}
            value={Math.max(0, pag)}
            onChange={(e) => irDireto(Number(e.target.value))}
            aria-label="Folhear o caderno"
            aria-valuetext={`Página ${Math.max(1, pag - off + 1)} de ${paginas}`}
          />
          <span>{paginas}</span>
        </div>
      )}

      {!somenteLeitura && <CorDaCapa cor={cor} aoEscolher={escolherCor} />}
    </div>
  );
}

// Botão "Capa" embaixo do livro: paleta de capas de caderno e um seletor livre.
function CorDaCapa({ cor, aoEscolher }: { cor: string; aoEscolher: (cor: string, esperar?: number) => void }) {
  const [aberta, setAberta] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);

  // Clicar fora ou Esc fecha.
  useEffect(() => {
    if (!aberta) return;
    const fora = (e: PointerEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAberta(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberta(false);
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberta]);

  const amostra = (c: string) => ({ "--amostra": c }) as CSSProperties;
  return (
    <div className="cad-barra cad-barra--capa" ref={raiz}>
      <button type="button" className="cad-capa-botao" aria-expanded={aberta} aria-haspopup="true" onClick={() => setAberta((v) => !v)}>
        <span className="cad-capa-amostra" style={amostra(cor)} />
        Cor da capa
      </button>
      {aberta && (
        <div className="cad-capa-paleta" role="group" aria-label="Cor da capa do caderno">
          {CAPAS.map((c) => (
            <button
              key={c.cor}
              type="button"
              className="cad-capa-opcao"
              style={amostra(c.cor)}
              title={c.nome}
              aria-label={c.nome}
              aria-pressed={c.cor === cor}
              onClick={() => aoEscolher(c.cor)}
            />
          ))}
          <label className="cad-capa-livre">
            Outra cor
            <input type="color" value={cor} onChange={(e) => aoEscolher(e.target.value, 500)} aria-label="Escolher outra cor para a capa" />
          </label>
        </div>
      )}
    </div>
  );
}
