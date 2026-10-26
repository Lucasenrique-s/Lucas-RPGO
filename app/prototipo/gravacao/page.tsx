import { notFound } from "next/navigation";
import { DemoGravacao } from "./demo";

// Protótipo do overlay de gravação (docs/plano-gravacao-obs.md, Fase 1). Só em desenvolvimento.
export default function PrototipoGravacaoPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DemoGravacao />;
}
