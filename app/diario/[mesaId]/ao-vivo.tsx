"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRefreshAgrupado } from "@/lib/use-refresh-agrupado";
import { useRefreshOnFocus } from "@/lib/use-refresh-on-focus";

// Ouve o Broadcast `diario-<mesa>` (sem conteúdo) e recarrega a página: a leitura
// passa de novo pelo servidor, que decide o que esta pessoa pode ver.
// O nome do canal é fixo (todos precisam do mesmo tópico), então a assinatura
// só nasce depois de um tick: o remonte do modo dev não deixa canal pendurado.
export function DiarioAoVivo({ mesaId }: { mesaId: string }) {
  const refresh = useRefreshAgrupado();
  useRefreshOnFocus();

  useEffect(() => {
    const supabase = createClient();
    let canal: ReturnType<typeof supabase.channel> | null = null;
    const t = window.setTimeout(() => {
      canal = supabase
        .channel(`diario-${mesaId}`, { config: { broadcast: { self: false } } })
        .on("broadcast", { event: "mudou" }, refresh)
        .subscribe();
    }, 0);
    return () => {
      window.clearTimeout(t);
      if (canal) void supabase.removeChannel(canal);
    };
  }, [mesaId, refresh]);

  return null;
}
