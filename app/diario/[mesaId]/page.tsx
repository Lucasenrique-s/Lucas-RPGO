import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { usuarioDaRequest } from "@/lib/supabase/server";
import { carregarDiario } from "@/lib/diario-carregar";
import { carregarQuadros } from "@/lib/diario-quadros";
import { ThemeButton } from "@/components/temas/theme-button";
import { BotaoVoltar } from "@/components/botao-voltar";
import { DiarioView } from "./diario-view";
import "./diario.css";

type Params = {
  params: Promise<{ mesaId: string }>;
  searchParams: Promise<{ [chave: string]: string | string[] | undefined }>;
};

export default async function DiarioPage({ params, searchParams }: Params) {
  const { mesaId } = await params;
  const { area } = await searchParams;

  const user = await usuarioDaRequest();
  if (!user) redirect("/login");

  const dados = await carregarDiario(mesaId, user.id);
  if (!dados) {
    const existe = await prisma.mesa.findUnique({ where: { id: mesaId }, select: { id: true } });
    if (!existe) notFound();
    redirect("/dashboard");
  }

  // A lista de quadros não pode derrubar o resto do diário.
  const quadros = await carregarQuadros(mesaId, user.id).catch(() => null);

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
        notasWiki={dados.notasWiki}
        sessoes={dados.sessoes}
        capaCor={dados.capaCor}
        mencoes={dados.mencoes}
        relacoes={dados.relacoes}
        marcos={dados.marcos}
        autores={dados.autores}
        calendario={dados.calendario}
        quadros={quadros ?? undefined}
        areaInicial={area === "quadros" && quadros ? "quadros" : undefined}
      />
    </div>
  );
}
