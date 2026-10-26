"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CenaGravacao } from "@/components/gravacao/cena-gravacao";
import { montarCena } from "@/components/gravacao/montar-cena";
import { EVENTO_MUDOU } from "@/lib/gravacao";
import type { EstadoGravacao } from "@/lib/gravacao-servidor";
import { ALTURA_TELA, LARGURA_TELA } from "@/lib/layout-gravacao";
import { createClient } from "@/lib/supabase/client";

// Rede de segurança: busca o estado de tempos em tempos mesmo sem aviso
// (tela de gravação fechada, Realtime caído).
const INTERVALO_BUSCA = 5000;
// Vários avisos juntos (uma ação mexe em várias tabelas) viram uma busca só.
const ESPERA_AVISO = 150;

type Props = {
  mesaId: string;
  token: string;
  canal: string;
  estadoInicial: EstadoGravacao;
};

export function OverlayGravacao({ mesaId, token, canal, estadoInicial }: Props) {
  const [estado, setEstado] = useState<EstadoGravacao | null>(estadoInicial);
  const ultimo = useRef(JSON.stringify(estadoInicial));
  const escala = useEscalaDaJanela();

  useEffect(() => {
    let vivo = true;
    let pendente: ReturnType<typeof setTimeout> | null = null;

    async function buscar() {
      try {
        const r = await fetch(`/api/gravacao/${mesaId}?t=${encodeURIComponent(token)}`, { cache: "no-store" });
        if (!vivo) return;
        // Link trocado ou mesa apagada: some tudo (o OBS mostra o que estiver atrás).
        if (r.status === 404) {
          ultimo.current = "";
          setEstado(null);
          return;
        }
        if (!r.ok) return;
        const texto = await r.text();
        if (!vivo || texto === ultimo.current) return;
        ultimo.current = texto;
        setEstado(JSON.parse(texto) as EstadoGravacao);
      } catch {
        // Sem rede: fica com o último estado e tenta de novo no próximo ciclo.
      }
    }

    const agendar = () => {
      if (pendente) clearTimeout(pendente);
      pendente = setTimeout(buscar, ESPERA_AVISO);
    };

    // Broadcast precisa do nome exato (quem avisa usa o mesmo), então aqui
    // não vale o `canal()` com sufixo aleatório dos postgres_changes.
    const supabase = createClient();
    const channel = supabase.channel(canal).on("broadcast", { event: EVENTO_MUDOU }, agendar).subscribe();
    const intervalo = setInterval(buscar, INTERVALO_BUSCA);

    return () => {
      vivo = false;
      clearInterval(intervalo);
      if (pendente) clearTimeout(pendente);
      supabase.removeChannel(channel);
    };
  }, [mesaId, token, canal]);

  const cena = useMemo(() => (estado ? montarCena(estado) : null), [estado]);
  if (!cena) return <div className="gv-overlay" />;

  return (
    <div className="gv-overlay">
      <div style={{ transform: `scale(${escala})`, transformOrigin: "0 0" }}>
        <CenaGravacao layout={cena.layout} dados={cena.dados} mostrar={cena.mostrar} />
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
