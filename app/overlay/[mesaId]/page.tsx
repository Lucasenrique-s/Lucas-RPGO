import type { Metadata } from "next";
import { canalDaGravacao } from "@/lib/gravacao";
import { carregarEstadoGravacao } from "@/lib/gravacao-servidor";
import { OverlayGravacao } from "./overlay";
import "./overlay.css";

export const metadata: Metadata = { title: "Overlay de gravação" };

type Props = {
  params: Promise<{ mesaId: string }>;
  searchParams: Promise<{ t?: string }>;
};

// Fonte de Navegador do OBS (docs/plano-gravacao-obs.md, Fase 2): 1920×1080,
// fundo transparente, sem login. O token `t` vem do link copiado na tela de gravação.
export default async function OverlayPage({ params, searchParams }: Props) {
  const { mesaId } = await params;
  const { t = "" } = await searchParams;
  const estado = await carregarEstadoGravacao(mesaId, t);
  if (!estado) {
    return (
      <div className="gv-overlay gv-overlay-erro">
        Link de gravação inválido. Copie o link de novo na tela de gravação do Hand Rolls.
      </div>
    );
  }
  return <OverlayGravacao mesaId={mesaId} token={t} canal={await canalDaGravacao(t)} estadoInicial={estado} />;
}
