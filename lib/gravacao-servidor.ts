// Estado do overlay de gravação, montado no servidor (docs/plano-gravacao-obs.md,
// Fase 2). O OBS não tem login: quem chega aqui é conferido pelo token da
// ConfigGravacao, e a leitura vai direto pelo Prisma (sem RLS).

import { timingSafeEqual } from "node:crypto";
import type { DadosCardGravacao } from "@/components/gravacao/card-gravacao";
import { prisma } from "./prisma";
import { SO_PRINCIPAIS } from "./acesso-ficha";
import { ordenarParticipantes } from "./combate";
import { catalogoCondicoesDoNarrador } from "./combate-servidor";
import { corDaCondicao, lerCondicoesAtivas, mesmaCondicao } from "./condicoes";
import { SELECT_ACAO_QUE_DURA, recebidasDaMesa } from "./efeitos-servidor";
import { normalizarEfeitoCor } from "./estilos-cor";
import {
  CONFIG_GRAVACAO_PADRAO,
  ID_NARRADOR,
  gerarTokenGravacao,
  lerConfigGravacao,
  type ConfigGravacao,
} from "./gravacao";
import { contextoDasFormulas, fontesDeEfeitoDeItens, maximoDoRecurso } from "./op-rpg";
import { resumirPersonagem } from "./resumo-personagem";

// Personagem pronto pro card (sem `falando`, que vem do Discord).
export type PersonagemGravacao = Omit<DadosCardGravacao, "falando">;

export type EstadoGravacao = {
  config: ConfigGravacao;
  // Jogadores da mesa (fichas principais), em ordem alfabética.
  personagens: PersonagemGravacao[];
  // Combate ativo: ordem de iniciativa (só os personagens) e de quem é a vez.
  combate: { ordem: string[]; vez: { personagemId: string | null; criatura: boolean } } | null;
};

/** A config da mesa; cria na primeira vez, com todo mundo presente. */
export async function garantirConfigGravacao(mesaId: string) {
  const existente = await prisma.configGravacao.findUnique({ where: { mesaId } });
  if (existente) return existente;
  const jogadores = await prisma.personagem.findMany({
    where: { mesaId, molde: false, ...SO_PRINCIPAIS },
    select: { id: true },
  });
  const config: ConfigGravacao = {
    ...CONFIG_GRAVACAO_PADRAO,
    presentes: [ID_NARRADOR, ...jogadores.map((j) => j.id)],
  };
  // upsert: duas abas abrindo a tela ao mesmo tempo não criam duas.
  return prisma.configGravacao.upsert({
    where: { mesaId },
    create: { mesaId, token: gerarTokenGravacao(), config },
    update: {},
  });
}

function mesmoToken(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** null = token errado ou mesa sem gravação configurada. */
export async function carregarEstadoGravacao(mesaId: string, token: string): Promise<EstadoGravacao | null> {
  const linha = await prisma.configGravacao.findUnique({
    where: { mesaId },
    select: { token: true, config: true, mesa: { select: { userId: true } } },
  });
  if (!linha || !token || !mesmoToken(linha.token, token)) return null;
  const config = lerConfigGravacao(linha.config);

  const [personagens, sessao, catalogo] = await Promise.all([
    prisma.personagem.findMany({
      where: { mesaId, molde: false, ...SO_PRINCIPAIS },
      orderBy: { nome: "asc" },
      include: {
        itens: true,
        habilidades: true,
        periciasCustom: { select: { slug: true } },
        arvores: { select: { id: true, nos: true } },
        acoes: { select: SELECT_ACAO_QUE_DURA },
        recursos: { orderBy: { ordem: "asc" } },
      },
    }),
    prisma.sessao.findFirst({
      where: { mesaId, encerradaEm: null },
      select: {
        combates: {
          where: { encerradoEm: null },
          select: {
            turnoAtual: true,
            participantes: {
              select: { personagemId: true, criaturaId: true, iniciativa: true, ordem: true, condicoesAtivas: true },
            },
          },
        },
      },
    }),
    catalogoCondicoesDoNarrador(linha.mesa.userId),
  ]);
  const recebidas = await recebidasDaMesa(mesaId, personagens.map((p) => p.id));

  const combateAtivo = sessao?.combates[0] ?? null;
  const participantes = combateAtivo ? ordenarParticipantes(combateAtivo.participantes) : [];
  const naInstancia = new Map(
    participantes.flatMap((i) => (i.personagemId ? [[i.personagemId, i.condicoesAtivas] as const] : [])),
  );

  const estiloDaCondicao = (nome: string) => {
    const c = catalogo.find((x) => mesmaCondicao(x.nome, nome));
    return { nome, cor: c?.cor ?? corDaCondicao(nome), cor2: c?.cor2 ?? null, efeito: c?.efeito ?? "solido" as const };
  };

  const lista: PersonagemGravacao[] = personagens.map((p) => {
    const resumo = resumirPersonagem(p, recebidas.get(p.id));
    const ctx = contextoDasFormulas([...p.habilidades, ...fontesDeEfeitoDeItens(p.itens)], {
      nivel: p.nivel,
      atributos: p,
    });
    const escolhidos = new Set(config.recursos[p.id] ?? []);
    // Em combate as condições moram na instância; fora, na ficha.
    const condicoes = lerCondicoesAtivas(naInstancia.get(p.id) ?? p.condicoes);
    return {
      id: p.id,
      nome: p.nome,
      imagemUrl: p.fotoUrl,
      pv: { atual: resumo.hpAtual, max: resumo.hpMax, temp: resumo.hpTemp },
      pp: { atual: resumo.ppAtual, max: resumo.ppMax },
      recursos: p.recursos
        .filter((r) => escolhidos.has(r.id))
        .map((r) => ({
          id: r.id,
          nome: r.nome,
          atual: r.valorAtual,
          max: maximoDoRecurso(r, ctx),
          cor: r.cor,
          cor2: r.cor2,
          efeito: normalizarEfeitoCor(r.efeito),
        })),
      condicoes: condicoes.map((c) => estiloDaCondicao(c.nome)),
    };
  });

  const daVez = combateAtivo ? participantes[combateAtivo.turnoAtual] : undefined;
  return {
    config,
    personagens: lista,
    combate: combateAtivo
      ? {
        ordem: participantes.flatMap((i) => (i.personagemId ? [i.personagemId] : [])),
        vez: { personagemId: daVez?.personagemId ?? null, criatura: !!daVez?.criaturaId },
      }
      : null,
  };
}
