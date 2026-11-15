import { notFound, redirect } from "next/navigation";
import { usuarioDaRequest } from "@/lib/supabase/server";
import { carregarConteudoQuadro, carregarQuadro } from "@/lib/diario-quadros";
import { QuadroTela } from "./quadro-tela";

type Params = { params: Promise<{ mesaId: string; quadroId: string }> };

export default async function QuadroPage({ params }: Params) {
  const { mesaId, quadroId } = await params;

  const user = await usuarioDaRequest();
  if (!user) redirect("/login");

  const quadro = await carregarQuadro(mesaId, quadroId, user.id);
  if (!quadro) notFound();

  const conteudo = await carregarConteudoQuadro(mesaId, quadroId, { userId: quadro.meuId, narrador: quadro.ehNarrador });

  return <QuadroTela mesaId={mesaId} quadro={quadro} conteudo={conteudo} />;
}
