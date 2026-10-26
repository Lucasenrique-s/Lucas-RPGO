import type { EstadoGravacao } from "@/lib/gravacao-servidor";
import { ID_NARRADOR, mostrarDoPersonagem, ordenarPorConfig, type MostrarGravacao } from "@/lib/gravacao";
import { calcularLayout, type SaidaLayout } from "@/lib/layout-gravacao";
import type { DadosCardGravacao } from "./card-gravacao";

export type Cena = {
  layout: SaidaLayout;
  dados: Record<string, DadosCardGravacao>;
  mostrar: (id: string) => MostrarGravacao;
};

/**
 * Estado do servidor → o que a CenaGravacao desenha. `falando`: ids de quem
 * fala agora (Discord, Fase 9). Mesma conta no overlay e na prévia.
 */
export function montarCena(estado: EstadoGravacao, falando: ReadonlySet<string> = new Set()): Cena {
  const { config } = estado;
  const dados: Record<string, DadosCardGravacao> = {
    [ID_NARRADOR]: {
      id: ID_NARRADOR,
      nome: config.narrador.nome,
      imagemUrl: config.narrador.imagemUrl,
      narrador: true,
      recursos: [],
      condicoes: [],
      falando: falando.has(ID_NARRADOR),
    },
  };
  for (const p of estado.personagens) dados[p.id] = { ...p, falando: falando.has(p.id) };

  // Só quem existe: personagem que saiu da mesa some sozinho.
  const presentes = config.presentes.filter((id) => dados[id]);
  const layout = calcularLayout({
    modo: config.modo,
    cards: ordenarPorConfig(presentes, config.ordem),
    idNarrador: ID_NARRADOR,
    emCena: config.emCena,
    foco: config.foco,
    narradorDestacado: false,
    mapa: config.mapa,
  });

  return { layout, dados, mostrar: (id) => mostrarDoPersonagem(config, id) };
}
