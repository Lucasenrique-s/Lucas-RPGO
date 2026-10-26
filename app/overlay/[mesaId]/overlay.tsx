"use client";

import { useEffect, useMemo, useState } from "react";
import { CenaGravacao } from "@/components/gravacao/cena-gravacao";
import { montarCena } from "@/components/gravacao/montar-cena";
import { useEstadoGravacao } from "@/components/gravacao/use-estado-gravacao";
import { EVENTO_OBS } from "@/lib/gravacao";
import type { EstadoGravacao } from "@/lib/gravacao-servidor";
import { ALTURA_TELA, LARGURA_TELA } from "@/lib/layout-gravacao";
import { useMapaNoObs } from "@/lib/obs-mapa";

// O status do OBS vai pra tela de gravação a cada mudança e de tempos em
// tempos (pra quem abrir a tela depois).
const INTERVALO_STATUS = 5000;

type Props = {
  mesaId: string;
  token: string;
  canal: string;
  estadoInicial: EstadoGravacao;
};

export function OverlayGravacao({ mesaId, token, canal, estadoInicial }: Props) {
  // Link trocado ou mesa apagada: some tudo (o OBS mostra o que estiver atrás).
  const [estado, , enviar] = useEstadoGravacao(mesaId, token, canal, estadoInicial);
  const escala = useEscalaDaJanela();
  const cena = useMemo(() => (estado ? montarCena(estado) : null), [estado]);

  // Mapa do VTT (Fase 6): só conecta no OBS depois que o mapa foi ligado.
  const mapa = estado?.config.mapa;
  const [mapaUsado, setMapaUsado] = useState(!!mapa?.ligado);
  if (mapa?.ligado && !mapaUsado) setMapaUsado(true);
  const statusObs = useMapaNoObs(
    {
      ligado: !!mapa?.ligado,
      retangulo: cena?.layout.mapa ?? null,
      encaixe: mapa?.encaixe ?? "ajustar",
      fonte: mapa?.fonteObs ?? "Mapa",
    },
    useSenhaDoHash(),
    mapaUsado,
  );

  // Pelo texto: o mesmo status de novo (objeto novo) não manda outra vez.
  const textoStatus = statusObs ? JSON.stringify(statusObs) : null;
  useEffect(() => {
    if (!textoStatus) return;
    const mandar = () => enviar(EVENTO_OBS, { status: JSON.parse(textoStatus) });
    mandar();
    const t = setInterval(mandar, INTERVALO_STATUS);
    return () => clearInterval(t);
  }, [textoStatus, enviar]);

  if (!cena) return <div className="gv-overlay" />;

  return (
    <div className="gv-overlay">
      <div style={{ transform: `scale(${escala})`, transformOrigin: "0 0" }}>
        <CenaGravacao layout={cena.layout} dados={cena.dados} mostrar={cena.mostrar} vez={cena.vez} />
      </div>
    </div>
  );
}

// Senha do WebSocket do OBS no fim do link (#obs=...): o hash não vai pro
// servidor, fica só no PC de quem grava.
function useSenhaDoHash(): string | null {
  const [senha, setSenha] = useState<string | null>(null);
  useEffect(() => {
    const ler = () => setSenha(new URLSearchParams(window.location.hash.slice(1)).get("obs"));
    ler();
    window.addEventListener("hashchange", ler);
    return () => window.removeEventListener("hashchange", ler);
  }, []);
  return senha;
}

// No OBS a janela tem 1920×1080 e a escala é 1; aberto no navegador, o palco
// encolhe pra caber.
function useEscalaDaJanela() {
  const [escala, setEscala] = useState(1);
  useEffect(() => {
    const ajustar = () => setEscala(Math.min(window.innerWidth / LARGURA_TELA, window.innerHeight / ALTURA_TELA));
    ajustar();
    window.addEventListener("resize", ajustar);
    return () => window.removeEventListener("resize", ajustar);
  }, []);
  return escala;
}
