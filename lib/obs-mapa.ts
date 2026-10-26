"use client";

// Fase 6 (docs/plano-gravacao-obs.md): o overlay, rodando dentro do OBS,
// conecta no obs-websocket local e põe a fonte do mapa do VTT no retângulo
// do layout, deslizando junto com os cards.

import { useEffect, useRef, useState } from "react";
import type OBSWebSocket from "obs-websocket-js";
import type { EncaixeMapa } from "./gravacao";
import { LARGURA_TELA, type Retangulo } from "./layout-gravacao";

const URL_OBS = "ws://127.0.0.1:4455";
// Tentar de novo quando o OBS não responde (fechado, websocket desligado).
const ESPERA_RECONECTAR = 5000;
// Mesma duração e curva da transição dos cards (components/gravacao/gravacao.css).
const DURACAO = 450;
const CURVA: [number, number, number, number] = [0.4, 0, 0.2, 1];
// Alinhamento do OBS: topo + esquerda.
const TOPO_ESQUERDA = 5;

export type StatusObs = {
  conexao: "conectando" | "conectado" | "erro";
  // ok | não achou a fonte na cena atual | mapa desligado (fonte escondida)
  fonte: "ok" | "nao-encontrada" | "escondida" | null;
  cena: string | null;
  erro: string | null;
};

type Alvo = { ligado: boolean; retangulo: Retangulo | null; encaixe: EncaixeMapa; fonte: string };

/**
 * Só dentro do OBS (window.obsstudio), pra uma aba comum do navegador não
 * mexer na cena. `ativo`: o mapa já foi ligado alguma vez nesta sessão (antes
 * disso nem conecta).
 */
export function useMapaNoObs(alvo: Alvo, senha: string | null, ativo: boolean): StatusObs | null {
  const [status, setStatus] = useState<StatusObs | null>(null);
  const obsRef = useRef<OBSWebSocket | null>(null);
  const alvoRef = useRef(alvo);
  const aplicarRef = useRef<() => void>(() => {});

  // Conexão (e reconexão) com o OBS. Uma conexão por vez: falha de conexão
  // chega duas vezes (o erro do connect e o ConnectionClosed), e cada aviso
  // agendando a sua tentativa dobrava as conexões a cada falha.
  useEffect(() => {
    if (!ativo || typeof window === "undefined" || !("obsstudio" in window)) return;
    let vivo = true;
    let atual: OBSWebSocket | null = null;
    let espera: ReturnType<typeof setTimeout> | null = null;

    // Só uma tentativa agendada por vez.
    const tentarDeNovo = (erro: string) => {
      if (!vivo || espera) return;
      setStatus({ conexao: "erro", fonte: null, cena: null, erro });
      espera = setTimeout(() => {
        espera = null;
        void conectar();
      }, ESPERA_RECONECTAR);
    };

    async function conectar() {
      const { default: OBS } = await import("obs-websocket-js");
      if (!vivo) return;
      setStatus((s) => ({ conexao: "conectando", fonte: s?.fonte ?? null, cena: s?.cena ?? null, erro: null }));
      const obs = new OBS();
      atual = obs;
      obs.on("ConnectionClosed", (e) => {
        // Aviso de uma conexão que já não é a desta vez: ignora.
        if (atual !== obs) return;
        atual = null;
        obsRef.current = null;
        tentarDeNovo(mensagemDeErro(e));
      });
      // Cena trocada: a fonte do mapa é procurada na cena nova.
      obs.on("CurrentProgramSceneChanged", () => {
        if (atual === obs) aplicarRef.current();
      });
      try {
        await obs.connect(URL_OBS, senha ?? undefined);
      } catch (e) {
        if (atual !== obs) return;
        atual = null;
        tentarDeNovo(mensagemDeErro(e));
        return;
      }
      if (!vivo || atual !== obs) {
        void obs.disconnect();
        return;
      }
      obsRef.current = obs;
      setStatus({ conexao: "conectado", fonte: null, cena: null, erro: null });
      aplicarRef.current();
    }
    void conectar();

    return () => {
      vivo = false;
      if (espera) clearTimeout(espera);
      const obs = atual;
      atual = null;
      obsRef.current = null;
      if (obs) void obs.disconnect();
    };
  }, [ativo, senha]);

  // Posição da fonte: anima do último retângulo enviado até o novo.
  const ultimo = useRef<Retangulo | null>(null);
  const quadro = useRef<number | null>(null);
  // Corte que o narrador fez no OBS (abas e barra do navegador, bordas da
  // janela), lido na primeira vez que o overlay vê o item. Fica sempre; o do
  // Preencher entra por cima dele.
  const cortesDoNarrador = useRef(new Map<string, Corte>());
  useEffect(() => {
    alvoRef.current = alvo;
    aplicarRef.current = () => void aplicar();

    async function aplicar() {
      const obs = obsRef.current;
      if (!obs) return;
      const { ligado, retangulo, encaixe, fonte } = alvoRef.current;
      try {
        const { currentProgramSceneName: cena } = await obs.call("GetCurrentProgramScene");
        let itemId: number;
        try {
          ({ sceneItemId: itemId } = await obs.call("GetSceneItemId", { sceneName: cena, sourceName: fonte }));
        } catch {
          setStatus({ conexao: "conectado", fonte: "nao-encontrada", cena, erro: null });
          return;
        }
        await obs.call("SetSceneItemEnabled", { sceneName: cena, sceneItemId: itemId, sceneItemEnabled: ligado && !!retangulo });
        setStatus({ conexao: "conectado", fonte: ligado && retangulo ? "ok" : "escondida", cena, erro: null });
        if (!ligado || !retangulo) return;

        const { baseWidth } = await obs.call("GetVideoSettings");
        const fator = baseWidth / LARGURA_TELA;
        const { sceneItemTransform: t } = await obs.call("GetSceneItemTransform", { sceneName: cena, sceneItemId: itemId });
        const chave = `${cena}:${itemId}`;
        if (!cortesDoNarrador.current.has(chave)) {
          cortesDoNarrador.current.set(chave, {
            esquerda: Number(t.cropLeft) || 0,
            direita: Number(t.cropRight) || 0,
            topo: Number(t.cropTop) || 0,
            baixo: Number(t.cropBottom) || 0,
          });
        }
        const corte = cortesDoNarrador.current.get(chave)!;
        // O que sobra da fonte depois do corte do narrador.
        const tamanhoFonte = {
          w: Math.max(0, (Number(t.sourceWidth) || 0) - corte.esquerda - corte.direita),
          h: Math.max(0, (Number(t.sourceHeight) || 0) - corte.topo - corte.baixo),
        };

        const de = ultimo.current ?? retangulo;
        ultimo.current = retangulo;
        if (quadro.current) cancelAnimationFrame(quadro.current);
        const inicio = performance.now();
        const passo = (agora: number) => {
          const p = Math.min(1, (agora - inicio) / DURACAO);
          const k = curva(p);
          const r = {
            x: de.x + (retangulo.x - de.x) * k,
            y: de.y + (retangulo.y - de.y) * k,
            w: de.w + (retangulo.w - de.w) * k,
            h: de.h + (retangulo.h - de.h) * k,
          };
          void obs
            .call("SetSceneItemTransform", {
              sceneName: cena,
              sceneItemId: itemId,
              sceneItemTransform: transformada(r, fator, encaixe, tamanhoFonte, corte),
            })
            .catch(() => {});
          if (p < 1) quadro.current = requestAnimationFrame(passo);
        };
        quadro.current = requestAnimationFrame(passo);
      } catch (e) {
        setStatus({ conexao: "conectado", fonte: null, cena: null, erro: e instanceof Error ? e.message : String(e) });
      }
    }
    void aplicar();
  }, [alvo.ligado, alvo.retangulo?.x, alvo.retangulo?.y, alvo.retangulo?.w, alvo.retangulo?.h, alvo.encaixe, alvo.fonte]); // eslint-disable-line react-hooks/exhaustive-deps

  return status;
}

// Códigos de fechamento do obs-websocket que dizem o que fazer.
const SENHA_ERRADA = 4009;
const SEM_SENHA = 4008;

function mensagemDeErro(e: unknown): string {
  const codigo = (e as { code?: number } | null)?.code;
  if (codigo === SENHA_ERRADA) return "Senha do WebSocket errada.";
  if (codigo === SEM_SENHA) return "O WebSocket do OBS pede senha: coloque ela aqui.";
  if (codigo === 1006 || codigo === undefined || codigo === -1) {
    return "Não achei o OBS (o servidor WebSocket está ligado, na porta 4455?).";
  }
  const texto = e instanceof Error && e.message ? `: ${e.message}` : "";
  return `O OBS fechou a conexão (código ${codigo}${texto}).`;
}

type Corte = { esquerda: number; direita: number; topo: number; baixo: number };

// Retângulo do layout (px de 1920×1080) → transform do item no OBS.
// Ajustar: cabe inteiro (OBS escala dentro da caixa). Preencher: corta as
// sobras da fonte pra ela ter a proporção da caixa e estica (sem distorcer).
// `fonte`: o tamanho visível depois do corte do narrador, que vale nos dois.
function transformada(
  r: Retangulo,
  fator: number,
  encaixe: EncaixeMapa,
  fonte: { w: number; h: number },
  corte: Corte,
): Record<string, number | string> {
  const base = {
    positionX: r.x * fator,
    positionY: r.y * fator,
    rotation: 0,
    alignment: TOPO_ESQUERDA,
    boundsAlignment: 0,
    boundsWidth: Math.max(1, r.w * fator),
    boundsHeight: Math.max(1, r.h * fator),
  };
  if (encaixe === "ajustar" || !fonte.w || !fonte.h) {
    return {
      ...base,
      boundsType: "OBS_BOUNDS_SCALE_INNER",
      cropLeft: corte.esquerda,
      cropRight: corte.direita,
      cropTop: corte.topo,
      cropBottom: corte.baixo,
    };
  }
  const escala = Math.max(r.w / fonte.w, r.h / fonte.h);
  const sobraX = Math.floor(Math.max(0, (fonte.w - r.w / escala) / 2));
  const sobraY = Math.floor(Math.max(0, (fonte.h - r.h / escala) / 2));
  return {
    ...base,
    boundsType: "OBS_BOUNDS_STRETCH",
    cropLeft: corte.esquerda + sobraX,
    cropRight: corte.direita + sobraX,
    cropTop: corte.topo + sobraY,
    cropBottom: corte.baixo + sobraY,
  };
}

// cubic-bezier(x1, y1, x2, y2) resolvido por bisseção (x → t → y).
function curva(x: number): number {
  const [x1, y1, x2, y2] = CURVA;
  const bez = (t: number, a: number, b: number) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 20; i += 1) {
    const t = (lo + hi) / 2;
    if (bez(t, x1, x2) < x) lo = t;
    else hi = t;
  }
  return bez((lo + hi) / 2, y1, y2);
}
