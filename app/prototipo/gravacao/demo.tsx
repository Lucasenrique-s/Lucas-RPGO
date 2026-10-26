"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CenaGravacao } from "@/components/gravacao/cena-gravacao";
import type { DadosCardGravacao } from "@/components/gravacao/card-gravacao";
import { corDaCondicao } from "@/lib/condicoes";
import {
  ID_NARRADOR,
  MODOS_GRAVACAO,
  POSICOES_MAPA,
  lerConfigGravacao,
  mostrarDoPersonagem,
  ordenarPorConfig,
  proximoExibir,
  type ConfigGravacao,
  type ExibirBarra,
  type MostrarGravacao,
} from "@/lib/gravacao";
import { ALTURA_TELA, LARGURA_TELA, calcularLayout } from "@/lib/layout-gravacao";
import "./gravacao-demo.css";

const RECURSOS: Record<string, Omit<DadosCardGravacao["recursos"][number], "id">> = {
  furia: { nome: "Fúria", atual: 3, max: 4, cor: "#e74c3c", cor2: null, efeito: "neon" },
  haki: { nome: "Haki", atual: 6, max: 10, cor: "#9b59b6", cor2: null, efeito: "holo" },
  municao: { nome: "Munição", atual: 14, max: 20, cor: "#95a5a6", cor2: null, efeito: "metalico" },
};

// Dados de mentira: 8 personagens pra testar de 1 a 8 cards.
const PERSONAGENS: DadosCardGravacao[] = [
  { nome: "Kaito", pv: [38, 52, 0], pp: [12, 20], recursos: ["furia"], condicoes: [] },
  { nome: "Mira", pv: [21, 40, 8], pp: [18, 24], recursos: ["haki"], condicoes: ["Envenenado"] },
  { nome: "Bartolomeu", pv: [60, 64, 0], pp: [5, 10], recursos: ["municao", "haki"], condicoes: [] },
  { nome: "Sora", pv: [9, 36, 0], pp: [20, 30], recursos: [], condicoes: ["Atordoado", "Caído"] },
  { nome: "Yuki", pv: [44, 44, 0], pp: [14, 14], recursos: ["furia"], condicoes: [] },
  { nome: "Drake", pv: [30, 58, 0], pp: [8, 16], recursos: [], condicoes: ["Agarrado"] },
  { nome: "Lin", pv: [27, 32, 5], pp: [22, 26], recursos: ["haki"], condicoes: [] },
  { nome: "Teo", pv: [15, 48, 0], pp: [3, 18], recursos: ["municao"], condicoes: [] },
].map((p, i) => ({
  id: `p${i + 1}`,
  nome: p.nome,
  imagemUrl: null,
  pv: { atual: p.pv[0], max: p.pv[1], temp: p.pv[2] },
  pp: { atual: p.pp[0], max: p.pp[1] },
  recursos: p.recursos.map((r) => ({ id: r, ...RECURSOS[r] })),
  condicoes: p.condicoes.map((nome) => ({ nome, cor: corDaCondicao(nome), cor2: null, efeito: "solido" as const })),
  falando: false,
}));

type Fundo = "xadrez" | "escuro" | "claro";

export function DemoGravacao() {
  const [config, setConfig] = useState<ConfigGravacao>(() => ({
    ...lerConfigGravacao({}),
    presentes: PERSONAGENS.slice(0, 4).map((p) => p.id),
  }));
  const [quantos, setQuantos] = useState(4);
  const [comNarrador, setComNarrador] = useState(true);
  const [turnoCriatura, setTurnoCriatura] = useState(false);
  const [falando, setFalando] = useState<string | null>(null);
  const [simularFala, setSimularFala] = useState(false);
  const [pv, setPv] = useState<Record<string, number>>({});
  const [fundo, setFundo] = useState<Fundo>("xadrez");

  // Fala de mentira: troca quem fala a cada 1,8 s.
  useEffect(() => {
    if (!simularFala) return;
    const t = setInterval(() => {
      const ids = [ID_NARRADOR, ...config.presentes];
      const sorteado = ids[Math.floor(Math.random() * ids.length)];
      setFalando((atual) => (atual === sorteado ? null : sorteado));
    }, 1800);
    return () => clearInterval(t);
  }, [simularFala, config.presentes]);

  const mudar = (patch: Partial<ConfigGravacao>) => setConfig((c) => ({ ...c, ...patch }));
  const mudarMostrar = (patch: Partial<MostrarGravacao>) =>
    setConfig((c) => ({ ...c, mostrar: { ...c.mostrar, ...patch } }));
  const mudarMapa = (patch: Partial<ConfigGravacao["mapa"]>) =>
    setConfig((c) => ({ ...c, mapa: { ...c.mapa, ...patch } }));

  function definirQuantos(n: number) {
    const q = Math.max(1, Math.min(PERSONAGENS.length, n));
    setQuantos(q);
    mudar({ presentes: PERSONAGENS.slice(0, q).map((p) => p.id) });
  }

  function alternarEmCena(id: string) {
    setConfig((c) => ({
      ...c,
      emCena: c.emCena.includes(id) ? c.emCena.filter((x) => x !== id) : [...c.emCena, id],
    }));
  }

  function alternarFoco(id: string) {
    setConfig((c) => ({
      ...c,
      foco: c.foco.includes(id) ? c.foco.filter((x) => x !== id) : [...c.foco, id],
    }));
  }

  function embaralhar() {
    const ids = [...config.presentes];
    for (let i = ids.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    mudar({ ordem: ids });
  }

  function simularDano() {
    const novo: Record<string, number> = {};
    for (const p of PERSONAGENS) novo[p.id] = Math.floor(Math.random() * (p.pv!.max + 1));
    setPv(novo);
  }

  // Atalhos fixos (Fase 4), já no protótipo pra testar a sensação.
  const configRef = useRef(config);
  useEffect(() => {
    configRef.current = config;
  }, [config]);
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(alvo.tagName))) return;
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      const c = configRef.current;
      const digito = /^Digit(\d)$/.exec(e.code)?.[1];

      // ⇧1…9 e 0 mexem na seleção do modo atual: Foco no Foco, em cena nos outros.
      const noFoco = c.modo === "foco";
      if (e.shiftKey && digito && digito !== "0") {
        const ids = ordenarPorConfig(c.presentes, c.ordem);
        const id = ids[Number(digito) - 1];
        if (id) (noFoco ? alternarFoco : alternarEmCena)(id);
      } else if (e.shiftKey && e.code === "KeyN") {
        alternarFoco(ID_NARRADOR);
      } else if (e.shiftKey && e.code === "KeyM") {
        const i = POSICOES_MAPA.findIndex((p) => p.slug === c.mapa.posicao);
        mudarMapa({ posicao: POSICOES_MAPA[(i + 1) % POSICOES_MAPA.length].slug, ligado: true });
      } else if (e.shiftKey) {
        return;
      } else if (digito === "0") {
        mudar(noFoco ? { foco: [] } : { emCena: [] });
      } else if (digito && Number(digito) <= MODOS_GRAVACAO.length) {
        mudar({ modo: MODOS_GRAVACAO[Number(digito) - 1].slug });
      } else if (e.code === "KeyN") mudarMostrar({ nome: !c.mostrar.nome });
      else if (e.code === "KeyV") mudarMostrar({ pv: proximoExibir(c.mostrar.pv) });
      else if (e.code === "KeyP") mudarMostrar({ pp: proximoExibir(c.mostrar.pp) });
      else if (e.code === "KeyR") mudarMostrar({ recursos: !c.mostrar.recursos });
      else if (e.code === "KeyC") mudarMostrar({ condicoes: !c.mostrar.condicoes });
      else if (e.code === "KeyF") mudarMostrar({ fala: !c.mostrar.fala });
      else if (e.code === "KeyM") mudarMapa({ ligado: !c.mapa.ligado });
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, []);

  const ids = ordenarPorConfig(config.presentes, config.ordem);

  const layout = useMemo(() => {
    const ordenados = ordenarPorConfig(config.presentes, config.ordem);
    return calcularLayout({
      modo: config.modo,
      cards: comNarrador ? [ID_NARRADOR, ...ordenados] : ordenados,
      idNarrador: ID_NARRADOR,
      emCena: config.emCena,
      foco: config.foco,
      narradorDestacado: turnoCriatura,
      mapa: config.mapa,
    });
  }, [config.modo, config.presentes, config.ordem, comNarrador, config.emCena, config.foco, turnoCriatura, config.mapa]);

  const dados = useMemo(() => {
    const out: Record<string, DadosCardGravacao> = {
      [ID_NARRADOR]: {
        id: ID_NARRADOR,
        nome: config.narrador.nome,
        imagemUrl: config.narrador.imagemUrl,
        narrador: true,
        recursos: [],
        condicoes: [],
        falando: falando === ID_NARRADOR,
      },
    };
    for (const p of PERSONAGENS) {
      out[p.id] = {
        ...p,
        pv: p.pv && { ...p.pv, atual: pv[p.id] ?? p.pv.atual },
        falando: falando === p.id,
      };
    }
    return out;
  }, [config.narrador, falando, pv]);

  return (
    <div className="gvd-pagina">
      <header className="gvd-topo">
        <h1>Protótipo — overlay de gravação</h1>
        <p>
          Dados de mentira. O xadrez é o transparente (no OBS aparece o que estiver atrás). O mapa aqui é de mentira; no
          OBS ele é a fonte de baixo, movida pelo overlay.
        </p>
      </header>

      <div className="gvd-corpo">
        <Previa fundo={fundo}>
          <CenaGravacao
            layout={layout}
            dados={dados}
            mostrar={(id) => mostrarDoPersonagem(config, id)}
            fundoMapa={<MapaDeMentira encaixe={config.mapa.encaixe} />}
          />
        </Previa>

        <aside className="gvd-controles">
          <Secao titulo="Modo">
            <div className="gvd-grupo">
              {MODOS_GRAVACAO.map((m, i) => (
                <button
                  key={m.slug}
                  type="button"
                  className={config.modo === m.slug ? "ativo" : ""}
                  onClick={() => mudar({ modo: m.slug })}
                >
                  <i className={`fas ${m.icone}`} /> {m.nome} <kbd>{i + 1}</kbd>
                </button>
              ))}
            </div>
          </Secao>

          <Secao titulo="Quem está na gravação">
            <div className="gvd-linha">
              <button type="button" onClick={() => definirQuantos(quantos - 1)} aria-label="Menos um jogador">
                <i className="fas fa-minus" />
              </button>
              <span className="gvd-contagem">{quantos} jogador{quantos > 1 ? "es" : ""}</span>
              <button type="button" onClick={() => definirQuantos(quantos + 1)} aria-label="Mais um jogador">
                <i className="fas fa-plus" />
              </button>
              <button type="button" onClick={embaralhar} title="Testar a animação de reordenar">
                <i className="fas fa-shuffle" /> Embaralhar
              </button>
            </div>
            <Caixa rotulo="Narrador na gravação" valor={comNarrador} aoMudar={setComNarrador} />
          </Secao>

          <Secao titulo="Em cena (Cinemático)">
            <div className="gvd-chips">
              {ids.map((id, i) => (
                <button
                  key={id}
                  type="button"
                  className={config.emCena.includes(id) ? "ativo" : ""}
                  onClick={() => alternarEmCena(id)}
                >
                  <i className="fas fa-star" /> {dados[id].nome} <kbd>⇧{i + 1}</kbd>
                </button>
              ))}
            </div>
            <Caixa rotulo="Turno de criatura (destaca o narrador)" valor={turnoCriatura} aoMudar={setTurnoCriatura} />
          </Secao>

          <Secao titulo="Foco (só quem estiver marcado)">
            <div className="gvd-chips">
              <button
                type="button"
                className={config.foco.includes(ID_NARRADOR) ? "ativo" : ""}
                onClick={() => alternarFoco(ID_NARRADOR)}
              >
                <i className="fas fa-book-open" /> Narrador <kbd>⇧N</kbd>
              </button>
              {ids.map((id, i) => (
                <button
                  key={id}
                  type="button"
                  className={config.foco.includes(id) ? "ativo" : ""}
                  onClick={() => alternarFoco(id)}
                >
                  <i className="fas fa-user-check" /> {dados[id].nome} <kbd>⇧{i + 1}</kbd>
                </button>
              ))}
            </div>
            <p className="gvd-dica">
              Vale no modo Foco (<kbd>4</kbd>). Nele, <kbd>⇧1…9</kbd> marcam o Foco em vez de &quot;em cena&quot;. Sem
              ninguém marcado, aparece só o narrador.
            </p>
          </Secao>

          <Secao titulo="Mostrar">
            <Caixa rotulo="Nome" tecla="N" valor={config.mostrar.nome} aoMudar={(v) => mudarMostrar({ nome: v })} />
            <Ciclo rotulo="PV" tecla="V" valor={config.mostrar.pv} aoMudar={(v) => mudarMostrar({ pv: v })} />
            <Ciclo rotulo="PP" tecla="P" valor={config.mostrar.pp} aoMudar={(v) => mudarMostrar({ pp: v })} />
            <Caixa rotulo="Recursos" tecla="R" valor={config.mostrar.recursos} aoMudar={(v) => mudarMostrar({ recursos: v })} />
            <Caixa rotulo="Condições" tecla="C" valor={config.mostrar.condicoes} aoMudar={(v) => mudarMostrar({ condicoes: v })} />
            <Caixa rotulo="Indicador de fala" tecla="F" valor={config.mostrar.fala} aoMudar={(v) => mudarMostrar({ fala: v })} />
            <Caixa rotulo="Simular fala" valor={simularFala} aoMudar={setSimularFala} />
            <button type="button" onClick={simularDano}>
              <i className="fas fa-heart-crack" /> Simular dano
            </button>
          </Secao>

          <Secao titulo="Mapa do VTT">
            <Caixa rotulo="Espaço do mapa" tecla="M" valor={config.mapa.ligado} aoMudar={(v) => mudarMapa({ ligado: v })} />
            <div className="gvd-grupo">
              {POSICOES_MAPA.map((p) => (
                <button
                  key={p.slug}
                  type="button"
                  className={config.mapa.posicao === p.slug ? "ativo" : ""}
                  onClick={() => mudarMapa({ posicao: p.slug, ligado: true })}
                >
                  {p.nome}
                </button>
              ))}
            </div>
            <p className="gvd-dica">
              <kbd>⇧M</kbd> troca a posição. &quot;No lugar do narrador&quot;: o card do narrador sai e o mapa fica com o
              espaço grande dele na Narração (nos outros modos, no Centro).
            </p>
            <div className="gvd-grupo">
              {(["ajustar", "preencher"] as const).map((e) => (
                <button
                  key={e}
                  type="button"
                  className={config.mapa.encaixe === e ? "ativo" : ""}
                  onClick={() => mudarMapa({ encaixe: e })}
                >
                  {e === "ajustar" ? "Ajustar (cabe inteiro)" : "Preencher (corta)"}
                </button>
              ))}
            </div>
          </Secao>

          <Secao titulo="Fundo da prévia">
            <div className="gvd-grupo">
              {(["xadrez", "escuro", "claro"] as const).map((f) => (
                <button key={f} type="button" className={fundo === f ? "ativo" : ""} onClick={() => setFundo(f)}>
                  {f[0].toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          </Secao>

          <Secao titulo="Atalhos">
            <ul className="gvd-atalhos">
              <li><kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd> modo</li>
              <li><kbd>⇧1…9</kbd> em cena (no Foco: marca o Foco) · <kbd>0</kbd> tira todos</li>
              <li><kbd>⇧N</kbd> narrador no Foco</li>
              <li><kbd>N</kbd> nome · <kbd>V</kbd> PV · <kbd>P</kbd> PP</li>
              <li><kbd>R</kbd> recursos · <kbd>C</kbd> condições · <kbd>F</kbd> fala</li>
              <li><kbd>M</kbd> mapa · <kbd>⇧M</kbd> posição do mapa</li>
            </ul>
          </Secao>
        </aside>
      </div>
    </div>
  );
}

// Palco 1920×1080 escalado pra largura disponível.
function Previa({ fundo, children }: { fundo: Fundo; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(0.5);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new ResizeObserver(([e]) => setEscala(e.contentRect.width / LARGURA_TELA));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} className={`gvd-previa gvd-fundo-${fundo}`} style={{ height: ALTURA_TELA * escala }}>
      <div style={{ transform: `scale(${escala})`, transformOrigin: "0 0", width: LARGURA_TELA }}>{children}</div>
    </div>
  );
}

// Mapa 3:2 (proporção comum de janela de VTT), pra ver Ajustar × Preencher.
function MapaDeMentira({ encaixe }: { encaixe: "ajustar" | "preencher" }) {
  return (
    <div className={`gvd-mapa gvd-mapa-${encaixe}`}>
      <div className="gvd-mapa-conteudo">
        <span className="gvd-token" style={{ left: "22%", top: "40%", background: "#e74c3c" }} />
        <span className="gvd-token" style={{ left: "30%", top: "55%", background: "#3498db" }} />
        <span className="gvd-token" style={{ left: "64%", top: "30%", background: "#2ecc71" }} />
        <span className="gvd-token gvd-token-grande" style={{ left: "70%", top: "62%", background: "#8e44ad" }} />
        <span className="gvd-mapa-rotulo">Mapa do VTT</span>
      </div>
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="gvd-secao">
      <h2>{titulo}</h2>
      {children}
    </section>
  );
}

function Caixa({ rotulo, tecla, valor, aoMudar }: { rotulo: string; tecla?: string; valor: boolean; aoMudar: (v: boolean) => void }) {
  return (
    <label className="gvd-caixa">
      <input type="checkbox" checked={valor} onChange={(e) => aoMudar(e.target.checked)} />
      {rotulo}
      {tecla && <kbd>{tecla}</kbd>}
    </label>
  );
}

const NOMES_EXIBIR: Record<ExibirBarra, string> = { numero: "Barra + número", barra: "Só barra", oculto: "Oculto" };

function Ciclo({ rotulo, tecla, valor, aoMudar }: { rotulo: string; tecla: string; valor: ExibirBarra; aoMudar: (v: ExibirBarra) => void }) {
  return (
    <div className="gvd-ciclo">
      <span>{rotulo}</span>
      <div className="gvd-grupo">
        {(["numero", "barra", "oculto"] as const).map((v) => (
          <button key={v} type="button" className={valor === v ? "ativo" : ""} onClick={() => aoMudar(v)}>
            {NOMES_EXIBIR[v]}
          </button>
        ))}
      </div>
      <kbd>{tecla}</kbd>
    </div>
  );
}
