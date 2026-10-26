import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { usuarioDaRequest } from "@/lib/supabase/server";
import { canalDaGravacao } from "@/lib/gravacao";
import { carregarEstadoGravacao, garantirConfigGravacao } from "@/lib/gravacao-servidor";
import { TelaGravacao } from "./tela-gravacao";
import "@/app/dashboard/dashboard.css";
import "./gravacao.css";

export const metadata: Metadata = { title: "Gravação · Hand Rolls" };

type Params = { params: Promise<{ mesaId: string }> };

// Tela de gravação (docs/plano-gravacao-obs.md, Fases 2 e 3): link do OBS,
// prévia e controles do overlay. Fica aberta enquanto grava: repassa as
// mudanças da mesa pro overlay.
export default async function GravacaoPage({ params }: Params) {
  const { mesaId } = await params;
  const user = await usuarioDaRequest();
  if (!user) redirect("/login");

  const mesa = await prisma.mesa.findUnique({ where: { id: mesaId }, select: { id: true, nome: true, userId: true } });
  if (!mesa) notFound();
  if (mesa.userId !== user.id) redirect("/dashboard");

  const { token } = await garantirConfigGravacao(mesaId);
  const [estado, sessao, recursos, cabecalhos] = await Promise.all([
    carregarEstadoGravacao(mesaId, token),
    prisma.sessao.findFirst({
      where: { mesaId, encerradaEm: null },
      select: { id: true, combates: { where: { encerradoEm: null }, select: { id: true } } },
    }),
    // Todos os recursos com barra, pra escolher quais vão pro card.
    prisma.recurso.findMany({
      where: { personagem: { mesaId }, tipo: { not: "ponto" } },
      orderBy: { ordem: "asc" },
      select: { id: true, nome: true, personagemId: true },
    }),
    headers(),
  ]);
  if (!estado) notFound();

  const host = cabecalhos.get("x-forwarded-host") ?? cabecalhos.get("host") ?? "localhost:3000";
  const protocolo = cabecalhos.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const linkObs = `${protocolo}://${host}/overlay/${mesaId}?t=${encodeURIComponent(token)}`;

  const recursosPorPersonagem: Record<string, { id: string; nome: string }[]> = {};
  for (const r of recursos) (recursosPorPersonagem[r.personagemId] ??= []).push({ id: r.id, nome: r.nome });

  return (
    <TelaGravacao
      // Link novo: a tela recomeça com o canal e o estado do token novo.
      key={token}
      mesa={{ id: mesa.id, nome: mesa.nome }}
      token={token}
      linkObs={linkObs}
      canal={await canalDaGravacao(token)}
      estadoInicial={estado}
      recursosPorPersonagem={recursosPorPersonagem}
      sessaoId={sessao?.id ?? null}
      combateId={sessao?.combates[0]?.id ?? null}
    />
  );
}
