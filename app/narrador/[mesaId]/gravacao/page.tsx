import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { usuarioDaRequest } from "@/lib/supabase/server";
import { SO_PRINCIPAIS } from "@/lib/acesso-ficha";
import { canalDaGravacao } from "@/lib/gravacao";
import { garantirConfigGravacao } from "@/lib/gravacao-servidor";
import { TelaGravacao } from "./tela-gravacao";
import "./gravacao.css";

export const metadata: Metadata = { title: "Gravação · Hand Rolls" };

type Params = { params: Promise<{ mesaId: string }> };

// Tela de gravação (docs/plano-gravacao-obs.md). Por enquanto (Fase 2): link do
// OBS, prévia e o repasse das mudanças da mesa pro overlay. Os controles vêm na Fase 3.
export default async function GravacaoPage({ params }: Params) {
  const { mesaId } = await params;
  const user = await usuarioDaRequest();
  if (!user) redirect("/login");

  const mesa = await prisma.mesa.findUnique({ where: { id: mesaId }, select: { id: true, nome: true, userId: true } });
  if (!mesa) notFound();
  if (mesa.userId !== user.id) redirect("/dashboard");

  const [config, personagens, sessao, cabecalhos] = await Promise.all([
    garantirConfigGravacao(mesaId),
    prisma.personagem.findMany({ where: { mesaId, molde: false, ...SO_PRINCIPAIS }, select: { id: true } }),
    prisma.sessao.findFirst({
      where: { mesaId, encerradaEm: null },
      select: { id: true, combates: { where: { encerradoEm: null }, select: { id: true } } },
    }),
    headers(),
  ]);

  const host = cabecalhos.get("x-forwarded-host") ?? cabecalhos.get("host") ?? "localhost:3000";
  const protocolo = cabecalhos.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const linkObs = `${protocolo}://${host}/overlay/${mesaId}?t=${encodeURIComponent(config.token)}`;

  return (
    <TelaGravacao
      mesa={{ id: mesa.id, nome: mesa.nome }}
      linkObs={linkObs}
      canal={await canalDaGravacao(config.token)}
      personagemIds={personagens.map((p) => p.id)}
      sessaoId={sessao?.id ?? null}
      combateId={sessao?.combates[0]?.id ?? null}
    />
  );
}
