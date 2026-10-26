import type { EstadoGravacao } from "@/lib/gravacao-servidor";
import { ID_NARRADOR, modoEfetivo, mostrarDoPersonagem, ordenarPorConfig, type MostrarGravacao } from "@/lib/gravacao";
import { calcularLayout, type SaidaLayout } from "@/lib/layout-gravacao";
import type { DadosCardGravacao } from "./card-gravacao";

export type Cena = {
  layout: SaidaLayout;
  dados: Record<string, DadosCardGravacao>;
  mostrar: (id: string) => MostrarGravacao;
  // Card de quem é a vez no combate (o narrador no turno de criatura); null = fora.
  vez: string | null;
};

/**
 * Estado do servidor → o que a CenaGravacao desenha. `falando`: ids de quem
 * fala agora (Discord, Fase 9). Mesma conta no overlay e na prévia.
 */
export function montarCena(estado: EstadoGravacao, falando: ReadonlySet<string> = new Set()): Cena {
  const { config, combate } = estado;
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
  let cards = ordenarPorConfig(presentes, config.ordem);

  // Combate com `destacarVez`: quem está no turno é o destaque do Cinemático
  // (criatura = o narrador, que joga por ela). Sem ela, vale a estrela da lista.
  let emCena = config.emCena;
  let narradorDestacado = false;
  let vez: string | null = null;
  if (combate && config.auto.destacarVez) {
    const daVez = combate.vez.personagemId;
    if (daVez && presentes.includes(daVez)) {
      emCena = [daVez];
      vez = daVez;
    } else if (combate.vez.criatura) {
      emCena = [];
      narradorDestacado = true;
      vez = presentes.includes(ID_NARRADOR) ? ID_NARRADOR : null;
    }
  }
  // Ordem da iniciativa; o narrador na frente e quem não está no combate no fim.
  if (combate && config.auto.ordemPorIniciativa) cards = ordenarPorConfig(cards, [ID_NARRADOR, ...combate.ordem]);

  const layout = calcularLayout({
    modo: modoEfetivo(config, combate?.id ?? null),
    cards,
    idNarrador: ID_NARRADOR,
    emCena,
    foco: config.foco,
    narradorDestacado,
    mapa: config.mapa,
  });

  return { layout, dados, mostrar: (id) => mostrarDoPersonagem(config, id), vez };
}
