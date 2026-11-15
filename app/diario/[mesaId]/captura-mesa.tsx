import { usuarioDaRequest } from "@/lib/supabase/server";
import { carregarRefsDiario } from "@/lib/diario-carregar";
import { CapturaGlobal } from "./captura-global";

// Monte em qualquer página da mesa: liga o atalho Ctrl+J de anotação rápida.
// Quem não participa da mesa não recebe nada.
export async function CapturaMesa({ mesaId }: { mesaId: string }) {
  const user = await usuarioDaRequest();
  if (!user) return null;
  const refs = await carregarRefsDiario(mesaId, user.id);
  if (!refs) return null;
  return <CapturaGlobal mesaId={mesaId} meuId={refs.meuId} fichas={refs.fichas} marcos={refs.marcos} sessoes={refs.sessoes} calendario={refs.calendario} />;
}
