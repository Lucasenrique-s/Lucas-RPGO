"use client";

import { useEffect, useMemo, useState } from "react";
import { CenaGravacao } from "@/components/gravacao/cena-gravacao";
import { montarCena } from "@/components/gravacao/montar-cena";
import { useEstadoGravacao } from "@/components/gravacao/use-estado-gravacao";
import type { EstadoGravacao } from "@/lib/gravacao-servidor";
import { ALTURA_TELA, LARGURA_TELA } from "@/lib/layout-gravacao";

type Props = {
  mesaId: string;
  token: string;
  canal: string;
  estadoInicial: EstadoGravacao;
};

export function OverlayGravacao({ mesaId, token, canal, estadoInicial }: Props) {
  // Link trocado ou mesa apagada: some tudo (o OBS mostra o que estiver atrás).
  const [estado] = useEstadoGravacao(mesaId, token, canal, estadoInicial);
  const escala = useEscalaDaJanela();
  const cena = useMemo(() => (estado ? montarCena(estado) : null), [estado]);
  if (!cena) return <div className="gv-overlay" />;

  return (
    <div className="gv-overlay">
      <div style={{ transform: `scale(${escala})`, transformOrigin: "0 0" }}>
        <CenaGravacao layout={cena.layout} dados={cena.dados} mostrar={cena.mostrar} vez={cena.vez} />
      </div>
    </div>
  );
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
