import { notFound } from "next/navigation";
import { DemoDiarioV2 } from "./demo";

// Protótipo do diário v2 (menções com @ e [[ ]], página de entidade, wiki da mesa).
// Dados de mentira, nada vai pro banco. Só em desenvolvimento.
export default function PrototipoDiarioV2Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DemoDiarioV2 />;
}
