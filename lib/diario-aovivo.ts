// Aviso em tempo real do diário. Só servidor.
//
// NÃO usa postgres_changes: o payload dele leva a linha inteira, e qualquer
// jogador assinando a tabela leria nota privada alheia. Aqui vai só um Broadcast
// sem conteúdo (`{tipo, id}`) no canal `diario-<mesa>`; quem recebe faz
// router.refresh(), e a releitura passa pela checagem de permissão do servidor.

export type AvisoDiario = { tipo: "ficha" | "nota" | "sessao"; id?: string };

export async function avisarDiario(mesaId: string, aviso: AvisoDiario): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !chave) return;
  try {
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: { apikey: chave, Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ topic: `diario-${mesaId}`, event: "mudou", payload: aviso, private: false }],
      }),
      signal: AbortSignal.timeout(4000),
    });
  } catch (e) {
    // O aviso é um extra: sem ele, os outros veem a mudança ao focar a aba ou recarregar.
    console.warn("[diario] broadcast falhou:", e instanceof Error ? e.message : e);
  }
}
