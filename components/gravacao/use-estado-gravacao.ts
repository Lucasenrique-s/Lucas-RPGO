"use client";

import { useEffect, useRef, useState } from "react";
import { EVENTO_CONFIG, EVENTO_MUDOU, lerConfigGravacao } from "@/lib/gravacao";
import type { EstadoGravacao } from "@/lib/gravacao-servidor";
import { createClient } from "@/lib/supabase/client";

// Rede de segurança: busca o estado de tempos em tempos mesmo sem aviso
// (tela de gravação fechada, Realtime caído).
const INTERVALO_BUSCA = 5000;
// Vários avisos juntos (uma ação mexe em várias tabelas) viram uma busca só.
const ESPERA_AVISO = 150;

/**
 * Estado do overlay ao vivo: busca na API a cada aviso do canal e a cada 5 s.
 * null = link trocado ou mesa apagada. `canal` null: não assina (a tela de
 * gravação, que é quem avisa, chama `recarregar` ela mesma).
 */
export function useEstadoGravacao(
  mesaId: string,
  token: string,
  canal: string | null,
  inicial: EstadoGravacao,
): [EstadoGravacao | null, () => void] {
  const [estado, setEstado] = useState<EstadoGravacao | null>(inicial);
  const ultimo = useRef(JSON.stringify(inicial));
  const agendarRef = useRef<() => void>(() => {});

  useEffect(() => {
    let vivo = true;
    let pendente: ReturnType<typeof setTimeout> | null = null;

    async function buscar() {
      try {
        const r = await fetch(`/api/gravacao/${mesaId}?t=${encodeURIComponent(token)}`, { cache: "no-store" });
        if (!vivo) return;
        if (r.status === 404) {
          ultimo.current = "";
          setEstado(null);
          return;
        }
        if (!r.ok) return;
        const texto = await r.text();
        if (!vivo || texto === ultimo.current) return;
        ultimo.current = texto;
        const novo = JSON.parse(texto) as EstadoGravacao;
        // Config que chegou pelo canal e ainda não está no banco: fica a do canal.
        setEstado((atual) =>
          atual && atual.config.versao > novo.config.versao ? { ...novo, config: atual.config } : novo,
        );
      } catch {
        // Sem rede: fica com o último estado e tenta de novo no próximo ciclo.
      }
    }

    const agendar = () => {
      if (pendente) clearTimeout(pendente);
      pendente = setTimeout(buscar, ESPERA_AVISO);
    };
    agendarRef.current = agendar;

    // Broadcast precisa do nome exato (quem avisa usa o mesmo), então aqui
    // não vale o `canal()` com sufixo aleatório dos postgres_changes.
    // Config nova direto da tela de gravação: aplica na hora.
    const aplicarConfig = ({ payload }: { payload: { config?: unknown } }) => {
      const config = lerConfigGravacao(payload?.config);
      setEstado((atual) => (atual && config.versao >= atual.config.versao ? { ...atual, config } : atual));
    };

    const supabase = canal ? createClient() : null;
    const channel = supabase
      ?.channel(canal!)
      .on("broadcast", { event: EVENTO_MUDOU }, agendar)
      .on("broadcast", { event: EVENTO_CONFIG }, aplicarConfig)
      .subscribe();
    const intervalo = setInterval(buscar, INTERVALO_BUSCA);

    return () => {
      vivo = false;
      agendarRef.current = () => {};
      clearInterval(intervalo);
      if (pendente) clearTimeout(pendente);
      if (supabase && channel) supabase.removeChannel(channel);
    };
  }, [mesaId, token, canal]);

  // Estável: lê o agendador do efeito atual.
  const [recarregar] = useState(() => () => agendarRef.current());
  return [estado, recarregar];
}
