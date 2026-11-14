import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { usuarioDaRequest } from "@/lib/supabase/server";
import { carregarDiario } from "@/lib/diario-carregar";
import { ThemeButton } from "@/components/temas/theme-button";
import { BotaoVoltar } from "@/components/botao-voltar";
import { DiarioView } from "./diario-view";
import "./diario.css";

type Params = { params: Promise<{ mesaId: string }> };

export default async function DiarioPage({ params }: Params) {
  const { mesaId } = await params;

  const user = await usuarioDaRequest();
  if (!user) redirect("/login");

  const dados = await carregarDiario(mesaId, user.id);
  if (!dados) {
    const existe = await prisma.mesa.findUnique({ where: { id: mesaId }, select: { id: true } });
    if (!existe) notFound();
    redirect("/dashboard");
  }

  return (
    <div className="diario-pagina">
      <div className="diario-topo">
        <BotaoVoltar
          fallbackHref={dados.ehNarrador ? `/narrador/${mesaId}` : "/dashboard"}
          className="diario-voltar"
          title="Voltar"
        >
          <i className="fas fa-arrow-left" />
        </BotaoVoltar>
        <div className="diario-titulo">
          <span className="diario-kicker">Diário de bordo</span>
          <h1>{dados.mesaNome}</h1>
        </div>
        <ThemeButton />
      </div>

      <DiarioView
        mesaId={mesaId}
        meuId={dados.meuId}
        ehNarrador={dados.ehNarrador}
        fichas={dados.fichas}
        notas={dados.notas}
        sessoes={dados.sessoes}
        mencoes={dados.mencoes}
        autores={dados.autores}
        calendario={dados.calendario}
      />
    </div>
  );
}
