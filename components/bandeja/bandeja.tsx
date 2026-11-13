"use client";

import {
  type CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  assinarRolagemPrivada,
  gravarRolagemPrivada,
  lerRolagemPrivada,
} from "@/lib/rolagem-privada";
import { PainelRolador } from "./painel-rolador";
import { PainelChat, type NaoLidas, type PainelChatHandle } from "./painel-chat";
import type { MensagemSerializada } from "@/lib/mensagens";
import {
  EVENTO_EMPILHAR,
  EVENTO_MENSAGEM,
  EVENTO_PUBLICAR,
  type EmpilharRolagemDetail,
} from "@/lib/empilhar-rolagem";
import type { EfeitosContexto } from "@/lib/op-rpg";
import "./bandeja.css";

type Props = {
  userId: string;
  userName: string;
  sessionId: string;
  personagemId?: string | null;
  onMensagemCriada?: (msg: MensagemSerializada) => void;
  mensagemExternaCriada?: MensagemSerializada | null;
  // Pré-carregadas no SSR — passadas direto pro PainelChat como estado inicial.
  mensagensIniciais: MensagemSerializada[];
  // Efeitos contextuais do personagem — o Rolador casa com o contexto da
  // rolagem empilhada pra sugerir chips (vantagem, crit expandido…).
  efeitosContexto?: EfeitosContexto;
  // Narrador com o combate em rolagem privada: o chat não recebe os números.
  rolagensPrivadas?: boolean;
};

type Aba = "rolador" | "chat" | "rolagens";

const ABAS: { id: Aba; nome: string; icone: string }[] = [
  { id: "rolador", nome: "Rolador", icone: "fa-dice-d20" },
  { id: "chat", nome: "Chat", icone: "fa-comment" },
  { id: "rolagens", nome: "Rolagens", icone: "fa-scroll" },
];
type Dock = "bottom" | "side-left" | "side-right" | "float";

const SNAP_THRESHOLD = 80;
const DRAG_THRESHOLD = 5;
// Quanto o arremesso conta: velocidade (px/ms) x isto = distancia extra percorrida.
const INERCIA_MS = 180;
const MARGIN = 20;
// Largura da bandeja aberta (a mesma do CSS; em tela estreita ela ocupa a tela).
const BANDEJA_W = 372;

export function Bandeja({
  userId,
  userName,
  sessionId,
  personagemId,
  onMensagemCriada,
  mensagemExternaCriada,
  mensagensIniciais,
  efeitosContexto,
  rolagensPrivadas = false,
}: Props) {
  const bandejaRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<PainelChatHandle>(null);
  const animRef = useRef<Animation | null>(null);

  const [aba, setAba] = useState<Aba>("rolador");
  const [collapsed, setCollapsed] = useState(true);
  const [dock, setDock] = useState<Dock>("bottom");
  // x relevante quando dock === "float" ou "bottom"; y quando "float" ou "side-*".
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  // Só o narrador (Bandeja sem personagem) escolhe rolar em privado; no servidor
  // a tela é a mesma, então a escolha fica guardada por mesa.
  const ehNarrador = !personagemId;
  const privadoManual = useSyncExternalStore(
    assinarRolagemPrivada,
    () => ehNarrador && lerRolagemPrivada(sessionId),
    () => false,
  );
  const alternarPrivado = useCallback(
    () => gravarRolagemPrivada(sessionId, !privadoManual),
    [sessionId, privadoManual],
  );
  const [naoLidas, setNaoLidas] = useState<NaoLidas>({ chat: 0, rolagens: 0 });
  const aoContarNaoLidas = useCallback((n: NaoLidas) => {
    setNaoLidas((atual) => (atual.chat === n.chat && atual.rolagens === n.rolagens ? atual : n));
  }, []);

  const [testesPendentes, setTestesPendentes] = useState(0);
  const abrirChat = useCallback(() => {
    setAba("chat");
    setCollapsed(false);
  }, []);

  // Estado de arrasto fica num ref — mousemove não re-renderiza.
  const dragRef = useRef({
    dragging: false,
    hasMoved: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    startLeft: 0,
    startTop: 0,
    // Últimas posições do ponteiro: dão a velocidade do arremesso ao soltar.
    amostras: [] as { t: number; x: number; y: number }[],
  });
  // Onde a bandeja estava ao soltar; o layout effect anima dali até o encaixe.
  const deRef = useRef<DOMRect | null>(null);

  useLayoutEffect(() => {
    const de = deRef.current;
    const el = bandejaRef.current;
    if (!de || !el) return;
    deRef.current = null;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Medido antes de a transição de largura andar: é o ponto de partida real.
    const para = el.getBoundingClientRect();
    const dx = de.left - para.left;
    const dy = de.top - para.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    animRef.current?.cancel();
    animRef.current = el.animate(
      [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }],
      { duration: 420, easing: "cubic-bezier(0.2, 0.9, 0.25, 1.06)" },
    );
  }, [dock, pos, collapsed]);

  useEffect(() => {
    const bandeja = bandejaRef.current;
    const header = headerRef.current;
    if (!bandeja || !header) return;

    // Passou da borda? Segue o dedo com resistência, em vez de bater na parede.
    function elastico(v: number, min: number, max: number) {
      const sobra = v < min ? min - v : v > max ? v - max : 0;
      if (!sobra) return v;
      const amortecido = Math.min(sobra * 0.3, 48);
      return v < min ? min - amortecido : max + amortecido;
    }

    function onMouseDown(e: PointerEvent) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if ((e.target as HTMLElement).closest(".switch-btn")) return;
      // Pegou durante o voo do encaixe: congela onde está e segue dali.
      animRef.current?.cancel();
      const rect = bandeja!.getBoundingClientRect();
      dragRef.current = {
        dragging: true,
        hasMoved: false,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startLeft: rect.left,
        startTop: rect.top,
        amostras: [{ t: performance.now(), x: e.clientX, y: e.clientY }],
      };
    }

    function onMouseMove(e: PointerEvent) {
      const d = dragRef.current;
      if (!d.dragging || e.pointerId !== d.pointerId) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;

      if (!d.hasMoved) {
        if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
        d.hasMoved = true;
        // Inline style sobrepõe a posição do dock atual. Sem transição —
        // o movimento segue o ponteiro direto. O dock só muda ao soltar.
        bandeja!.style.transition = "none";
        bandeja!.style.left = `${d.startLeft}px`;
        bandeja!.style.top = `${d.startTop}px`;
        bandeja!.style.right = "auto";
        bandeja!.style.bottom = "auto";
        bandeja!.dataset.arrastando = "true";
        try {
          header!.setPointerCapture(e.pointerId);
        } catch {}
      }

      const agora = performance.now();
      d.amostras.push({ t: agora, x: e.clientX, y: e.clientY });
      while (d.amostras.length > 2 && agora - d.amostras[0].t > 100) d.amostras.shift();

      const W = window.innerWidth;
      const H = window.innerHeight;
      const newLeft = elastico(d.startLeft + dx, 0, W - bandeja!.offsetWidth);
      const newTop = elastico(d.startTop + dy, 0, H - bandeja!.offsetHeight);
      bandeja!.style.left = `${newLeft}px`;
      bandeja!.style.top = `${newTop}px`;
    }

    function onMouseUp(e: PointerEvent) {
      const d = dragRef.current;
      if (!d.dragging || e.pointerId !== d.pointerId) return;
      d.dragging = false;
      bandeja!.style.transition = "";
      delete bandeja!.dataset.arrastando;
      try {
        header!.releasePointerCapture(e.pointerId);
      } catch {}

      if (d.hasMoved) {
        // Velocidade (px/ms) nas últimas amostras; parou antes de soltar = 0.
        const am = d.amostras;
        const ultimo = am[am.length - 1];
        const primeiro = am[0];
        let vx = 0;
        let vy = 0;
        if (e.type === "pointerup" && performance.now() - ultimo.t < 80 && ultimo.t > primeiro.t) {
          vx = (ultimo.x - primeiro.x) / (ultimo.t - primeiro.t);
          vy = (ultimo.y - primeiro.y) / (ultimo.t - primeiro.t);
        }
        snap(vx, vy);
      }
    }

    function snap(vx: number, vy: number) {
      const rect = bandeja!.getBoundingClientRect();
      deRef.current = rect;
      const W = window.innerWidth;
      const H = window.innerHeight;
      const largura = Math.min(BANDEJA_W, W);

      // Arremesso: encaixa onde a bandeja pararia, não onde o dedo soltou.
      const projLeft = Math.max(0, Math.min(rect.left + vx * INERCIA_MS, W - rect.width));
      const projTop = Math.max(0, Math.min(rect.top + vy * INERCIA_MS, H - rect.height));
      const distLeft = projLeft;
      const distRight = W - (projLeft + rect.width);
      const distBottom = H - (projTop + rect.height);

      // Limpa overrides inline — vão ser substituídos pelo style derivado do state.
      bandeja!.style.left = "";
      bandeja!.style.top = "";
      bandeja!.style.right = "";
      bandeja!.style.bottom = "";

      if (distBottom < SNAP_THRESHOLD) {
        setDock("bottom");
        setCollapsed(true);
        setPos({ x: Math.max(0, Math.min(projLeft, W - largura)), y: 0 });
      } else if (distLeft < SNAP_THRESHOLD) {
        setDock("side-left");
        setCollapsed(true);
        setPos({ x: 0, y: Math.max(MARGIN, Math.min(projTop, H - 100)) });
      } else if (distRight < SNAP_THRESHOLD) {
        setDock("side-right");
        setCollapsed(true);
        setPos({ x: 0, y: Math.max(MARGIN, Math.min(projTop, H - 100)) });
      } else {
        let finalLeft = projLeft;
        if (finalLeft + largura > W) finalLeft = W - largura - MARGIN;
        setDock("float");
        setPos({
          x: Math.max(MARGIN, finalLeft),
          y: Math.max(MARGIN, Math.min(projTop, H - 200)),
        });
      }
    }

    function onHeaderClick(e: MouseEvent) {
      if ((e.target as HTMLElement).closest(".switch-btn")) return;
      if (dragRef.current.hasMoved) return;
      setCollapsed((c) => !c);
    }

    // Janela mudou de tamanho: puxa a bandeja de volta pra dentro da tela.
    function onResize() {
      const W = window.innerWidth;
      const H = window.innerHeight;
      const largura = Math.min(BANDEJA_W, W);
      setPos((p) => {
        const x = Math.max(0, Math.min(p.x, W - largura));
        const y = Math.max(0, Math.min(p.y, H - 100));
        return x === p.x && y === p.y ? p : { x, y };
      });
    }

    // Ponteiro cobre mouse, toque e caneta: no celular a bandeja também arrasta.
    header.addEventListener("pointerdown", onMouseDown);
    header.addEventListener("click", onHeaderClick);
    document.addEventListener("pointermove", onMouseMove);
    document.addEventListener("pointerup", onMouseUp);
    document.addEventListener("pointercancel", onMouseUp);
    window.addEventListener("resize", onResize);

    return () => {
      header.removeEventListener("pointerdown", onMouseDown);
      header.removeEventListener("click", onHeaderClick);
      document.removeEventListener("pointermove", onMouseMove);
      document.removeEventListener("pointerup", onMouseUp);
      document.removeEventListener("pointercancel", onMouseUp);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  // Empilhar uma rolagem vinda da ficha foca a tab Rolador e expande a Bandeja
  // (a menos que abrirAuto === false). O preenchimento de dados/mod/contexto
  // fica no PainelRolador, que escuta o mesmo evento.
  useEffect(() => {
    function ouvir(e: Event) {
      const det = (e as CustomEvent<EmpilharRolagemDetail>).detail;
      if (!det) return;
      setAba("rolador");
      if (det.abrirAuto !== false) setCollapsed(false);
    }
    // Rolagem feita na ficha também abre o Rolador, pra mostrar o resultado.
    function abrir() {
      setAba("rolador");
      setCollapsed(false);
    }
    window.addEventListener(EVENTO_EMPILHAR, ouvir);
    window.addEventListener(EVENTO_PUBLICAR, abrir);
    return () => {
      window.removeEventListener(EVENTO_EMPILHAR, ouvir);
      window.removeEventListener(EVENTO_PUBLICAR, abrir);
    };
  }, []);

  const className =
    "bandeja " + `dock-${dock}` + (collapsed ? " collapsed" : "");

  const style: CSSProperties = {};
  if (dock === "float") {
    style.left = pos.x;
    style.top = pos.y;
  } else if (dock === "side-left") {
    style.top = pos.y;
  } else if (dock === "side-right") {
    style.top = pos.y;
  } else if (dock === "bottom") {
    if (pos.x > 0) style.left = pos.x;
  }

  const abaAtual = ABAS.find((a) => a.id === aba) ?? ABAS[0];
  const totalNaoLidas = naoLidas.chat + naoLidas.rolagens;
  const conversa = aba === "rolador" ? null : aba;

  function iconeHeader(): string {
    const isSide = dock === "side-left" || dock === "side-right";
    if (isSide && collapsed) {
      return `fas ${abaAtual.icone}`;
    }
    if (!collapsed) {
      return dock === "bottom" ? "fas fa-chevron-down" : "fas fa-times";
    }
    return "fas fa-chevron-up";
  }

  const onMensagemCriadaLocal = useCallback((msg: MensagemSerializada) => {
    chatRef.current?.appendLocal(msg);
    onMensagemCriada?.(msg);
  }, [onMensagemCriada]);

  useEffect(() => {
    if (!mensagemExternaCriada) return;
    chatRef.current?.appendLocal(mensagemExternaCriada);
  }, [mensagemExternaCriada]);

  // Mensagem gravada por uma action da ficha (dano, cura).
  useEffect(() => {
    function ouvir(e: Event) {
      const msg = (e as CustomEvent<MensagemSerializada>).detail;
      if (msg) chatRef.current?.appendLocal(msg);
    }
    window.addEventListener(EVENTO_MENSAGEM, ouvir);
    return () => window.removeEventListener(EVENTO_MENSAGEM, ouvir);
  }, []);

  return (
    <div ref={bandejaRef} className={className} style={style} id="bandeja">
      <div ref={headerRef} className="bandeja-header">
        <div className="header-left">
          {collapsed ? (
            <>
              <i className={`fas ${abaAtual.icone}`} />
              <span className="bandeja-titulo">{abaAtual.nome}</span>
              {testesPendentes > 0 && (
                <span
                  className="aba-badge teste-pendente"
                  aria-label={`${testesPendentes} ${testesPendentes === 1 ? "teste pendente" : "testes pendentes"}`}
                  title="Teste pedido pelo narrador"
                >
                  <i className="fas fa-dice-d20" /> {testesPendentes}
                </span>
              )}
              {totalNaoLidas > 0 && testesPendentes === 0 && (
                <span className="aba-badge" aria-label={`${totalNaoLidas} novas`}>
                  {totalNaoLidas > 99 ? "99+" : totalNaoLidas}
                </span>
              )}
            </>
          ) : (
            <div className="bandeja-abas" role="tablist">
              {ABAS.map((a) => {
                const novas = a.id === "rolador" ? 0 : naoLidas[a.id];
                return (
                  <button
                    key={a.id}
                    type="button"
                    role="tab"
                    aria-selected={aba === a.id}
                    className={"switch-btn" + (aba === a.id ? " active" : "")}
                    onClick={(e) => {
                      e.stopPropagation();
                      setAba(a.id);
                    }}
                  >
                    <i className={`fas ${a.icone}`} />
                    <span>{a.nome}</span>
                    {a.id === "chat" && testesPendentes > 0 && (
                      <span className="aba-badge teste-pendente" aria-label={`${testesPendentes} testes pendentes`}>
                        <i className="fas fa-dice-d20" /> {testesPendentes}
                      </span>
                    )}
                    {novas > 0 && aba !== a.id && !(a.id === "chat" && testesPendentes > 0) && (
                      <span className="aba-badge" aria-label={`${novas} novas`}>
                        {novas > 99 ? "99+" : novas}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {collapsed && totalNaoLidas > 0 && <span className="bandeja-ponto" aria-hidden="true" />}
        <i className={iconeHeader()} />
      </div>

      <div className="bandeja-body">
        <div
          className={"painel-bandeja" + (aba === "rolador" ? " active" : "")}
          style={{ display: aba === "rolador" ? "flex" : "none" }}
        >
          <PainelRolador
            userId={userId}
            userName={userName}
            sessionId={sessionId}
            onMensagemCriada={onMensagemCriadaLocal}
            efeitosContexto={efeitosContexto}
            privado={rolagensPrivadas || privadoManual}
            privadoPeloCombate={rolagensPrivadas}
            onAlternarPrivado={ehNarrador ? alternarPrivado : undefined}
          />
        </div>

        <div
          className={"painel-bandeja painel-conversa" + (conversa ? " active" : "")}
          style={{ display: conversa ? "flex" : "none" }}
        >
          <PainelChat
            ref={chatRef}
            userId={userId}
            userName={userName}
            sessionId={sessionId}
            personagemId={personagemId || null}
            mensagensIniciais={mensagensIniciais}
            aba={conversa ?? "chat"}
            visivel={!collapsed && conversa !== null}
            veRolagensPrivadas={ehNarrador}
            onNaoLidas={aoContarNaoLidas}
            onTestesPendentes={setTestesPendentes}
            onAbrirChat={abrirChat}
          />
        </div>
      </div>
    </div>
  );
}
