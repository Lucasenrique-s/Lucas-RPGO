import type { NextRequest } from "next/server";
import { carregarEstadoGravacao } from "@/lib/gravacao-servidor";

// Estado do overlay de gravação (docs/plano-gravacao-obs.md, Fase 2). Público
// (liberado no proxy): quem protege é o token `t`, o mesmo do link do OBS.
export async function GET(request: NextRequest, ctx: RouteContext<"/api/gravacao/[mesaId]">) {
  const { mesaId } = await ctx.params;
  const token = request.nextUrl.searchParams.get("t") ?? "";
  const estado = await carregarEstadoGravacao(mesaId, token);
  if (!estado) return Response.json({ erro: "Link de gravação inválido." }, { status: 404 });
  return Response.json(estado, { headers: { "Cache-Control": "no-store" } });
}
