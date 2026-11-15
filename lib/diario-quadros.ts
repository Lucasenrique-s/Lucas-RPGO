// Quadros de investigação: leitura no servidor. Só servidor.
// Toda leitura passa pela permissão de lib/diario-quadro-permissao.ts; as tabelas
// têm RLS fechado e ficam fora do Realtime (o navegador nunca lê direto do banco).

import { prisma } from "@/lib/prisma";
import { acessoAoDiario, filtroLeituraDiario, podeLerDiario, type AcessoDiario } from "@/lib/diario";
import { textoPuroRico } from "@/lib/descricao-rica";
import { normalizarTipoFicha } from "@/lib/diario-tipos";
import {
  filtroListaQuadros,
  permissoesDoQuadro,
  type AcessoQuadro,
  type Compartilhado,
} from "@/lib/diario-quadro-permissao";
import {
  LIMITES_QUADRO,
  ehCorCartao,
  ehAlinhamento,
  ehCorLigacao,
  ehCorTexto,
  ehFormatoCartao,
  ehNivelAcesso,
  ehTipoCartao,
  ehTracoLigacao,
  type CartaoDTO,
  type ConteudoQuadroDTO,
  type LigacaoDTO,
  type PapelNoQuadro,
  type QuadroResumoDTO,
  type TipoQuadro,
} from "@/lib/diario-quadro-tipos";

export const NOME_QUADRO_DA_MESA = "Quadro da mesa";

// Cada mesa tem um quadro público. Cria na primeira vez; o índice único parcial do banco
// garante que duas pessoas abrindo ao mesmo tempo não criem dois.
export async function garantirQuadroDaMesa(mesaId: string): Promise<void> {
  const existe = await prisma.diarioQuadro.findFirst({ where: { mesaId, tipo: "mesa" }, select: { id: true } });
  if (existe) return;
  await prisma.diarioQuadro.createMany({
    data: [{ mesaId, tipo: "mesa", nome: NOME_QUADRO_DA_MESA }],
    skipDuplicates: true,
  });
}

function papelDe(a: AcessoQuadro, q: { tipo: string; donoId: string | null }, comp: Compartilhado): PapelNoQuadro {
  if (q.tipo === "mesa") return "mesa";
  if (q.donoId === a.userId) return "dono";
  if (comp) return "compartilhado";
  return "narrador";
}

// Lista de quadros que a pessoa enxerga (null = fora da mesa).
// `comoUserId`: o narrador vendo a ficha de um jogador recebe a lista COMO esse jogador (o quadro da mesa, os dele e os
// compartilhados com ele). Abrir um quadro continua com o acesso do narrador, que só lê o que não é dele.
export async function carregarQuadros(mesaId: string, userId: string, opts?: { comoUserId?: string }): Promise<QuadroResumoDTO[] | null> {
  const real = await acessoAoDiario(mesaId, userId);
  if (!real) return null;
  let acesso = real;
  if (opts?.comoUserId && opts.comoUserId !== userId) {
    if (!real.narrador) return null;
    const como = await acessoAoDiario(mesaId, opts.comoUserId);
    if (!como) return null;
    acesso = como;
  }
  await garantirQuadroDaMesa(mesaId).catch(() => {});

  const linhas = await prisma.diarioQuadro.findMany({
    where: { mesaId, ...filtroListaQuadros(acesso) },
    orderBy: { atualizadoEm: "desc" },
    include: {
      // Cartões ocultos só contam pro narrador.
      _count: { select: { cartoes: { where: { apagadoEm: null, ...(acesso.narrador ? {} : { oculto: false }) } } } },
      acessos: { where: { userId: acesso.userId } },
    },
  });

  return linhas.map((q) => {
    const nivel = q.acessos[0] && ehNivelAcesso(q.acessos[0].nivel) ? q.acessos[0].nivel : null;
    return {
      id: q.id,
      tipo: q.tipo as TipoQuadro,
      nome: q.nome,
      donoId: q.donoId,
      papel: papelDe(acesso, q, nivel),
      nivel,
      cartoes: q._count.cartoes,
      fundoUrl: q.fundoUrl,
      atualizadoEm: q.atualizadoEm.toISOString(),
      permissoes: permissoesDoQuadro(acesso, q, nivel),
    };
  });
}

export type QuadroAbertoDTO = QuadroResumoDTO & {
  mesaNome: string;
  meuId: string;
  ehNarrador: boolean;
  // Nome de quem é cada pessoa (dono do quadro, autores dos cartões).
  autores: Record<string, string>;
};

// Um quadro, pra abrir em tela cheia. null = não existe ou a pessoa não pode ver.
export async function carregarQuadro(mesaId: string, quadroId: string, userId: string): Promise<QuadroAbertoDTO | null> {
  const acesso = await acessoAoDiario(mesaId, userId);
  if (!acesso) return null;
  const q = await prisma.diarioQuadro.findFirst({
    where: { id: quadroId, mesaId },
    include: {
      _count: { select: { cartoes: { where: { apagadoEm: null, ...(acesso.narrador ? {} : { oculto: false }) } } } },
      acessos: { where: { userId } },
      mesa: { select: { nome: true, userId: true } },
    },
  });
  if (!q) return null;
  const nivel = q.acessos[0] && ehNivelAcesso(q.acessos[0].nivel) ? q.acessos[0].nivel : null;
  const permissoes = permissoesDoQuadro(acesso, q, nivel);
  if (!permissoes.ver) return null;

  const membros = await prisma.personagem.findMany({
    where: { OR: [{ mesaId }, { dono: { mesaId } }], donoPersonagemId: null },
    select: { userId: true, nome: true },
  });
  const autores: Record<string, string> = {};
  for (const m of membros) autores[m.userId] = autores[m.userId] ? `${autores[m.userId]}, ${m.nome}` : m.nome;
  autores[q.mesa.userId] = "Narrador";

  return {
    id: q.id,
    tipo: q.tipo as TipoQuadro,
    nome: q.nome,
    donoId: q.donoId,
    papel: papelDe(acesso, q, nivel),
    nivel,
    cartoes: q._count.cartoes,
    fundoUrl: q.fundoUrl,
    atualizadoEm: q.atualizadoEm.toISOString(),
    permissoes,
    mesaNome: q.mesa.nome,
    meuId: acesso.userId,
    ehNarrador: acesso.narrador,
    autores,
  };
}

// ─── Conteúdo (cartões, ligações e o que eles referenciam) ────────────────

const previa = (texto: string, max: number) => {
  const t = textoPuroRico(texto).replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

const dtoCartao = (c: {
  id: string; tipo: string; formato: string; x: number; y: number; largura: number; altura: number; z: number;
  cor: string; texto: string; fonteTamanho: number | null; alinhamento: string; corTexto: string; negrito: boolean; refId: string | null; url: string | null; autorId: string; sessaoId: string | null;
  oculto: boolean; reveladoSessaoId: string | null; criadoEm: Date;
}): CartaoDTO => ({
  id: c.id,
  tipo: ehTipoCartao(c.tipo) ? c.tipo : "postit",
  formato: ehFormatoCartao(c.formato) ? c.formato : "cartao",
  x: c.x,
  y: c.y,
  largura: c.largura,
  altura: c.altura,
  z: c.z,
  cor: ehCorCartao(c.cor) ? c.cor : "amarelo",
  texto: c.texto,
  fonte: c.fonteTamanho,
  alinhamento: ehAlinhamento(c.alinhamento) ? c.alinhamento : "esquerda",
  corTexto: ehCorTexto(c.corTexto) ? c.corTexto : "padrao",
  negrito: c.negrito,
  refId: c.refId,
  url: c.url,
  autorId: c.autorId,
  sessaoId: c.sessaoId,
  oculto: c.oculto,
  reveladoSessaoId: c.reveladoSessaoId,
  criadoEm: c.criadoEm.toISOString(),
});

export const dtoCartaoDe = dtoCartao;

export const dtoLigacaoDe = (l: {
  id: string; deId: string; paraId: string; rotulo: string; cor: string; traco: string; seta: boolean;
  autorId: string; oculto: boolean;
}): LigacaoDTO => ({
  id: l.id,
  deId: l.deId,
  paraId: l.paraId,
  rotulo: l.rotulo,
  cor: ehCorLigacao(l.cor) ? l.cor : "cinza",
  traco: ehTracoLigacao(l.traco) ? l.traco : "continuo",
  seta: l.seta,
  autorId: l.autorId,
  oculto: l.oculto,
});

// Cartões e ligações de um quadro que a pessoa pode ver, e o que eles referenciam (só o que ela pode ler).
export async function carregarConteudoQuadro(
  mesaId: string,
  quadroId: string,
  acesso: AcessoDiario,
): Promise<ConteudoQuadroDTO> {
  // Lixeira: o que passou do prazo some de vez. Falha aqui não impede abrir o quadro.
  const limite = new Date(Date.now() - LIMITES_QUADRO.lixeiraDias * 86_400_000);
  await prisma.diarioCartao.deleteMany({ where: { quadroId, apagadoEm: { lt: limite } } }).catch(() => {});
  await prisma.diarioLigacao.deleteMany({ where: { quadroId, apagadoEm: { lt: limite } } }).catch(() => {});

  const ocultos = acesso.narrador ? {} : { oculto: false };
  const [cartoes, ligacoes] = await Promise.all([
    prisma.diarioCartao.findMany({ where: { quadroId, apagadoEm: null, ...ocultos }, orderBy: { criadoEm: "asc" } }),
    prisma.diarioLigacao.findMany({ where: { quadroId, apagadoEm: null, ...ocultos }, orderBy: { criadoEm: "asc" } }),
  ]);
  const idsCartao = new Set(cartoes.map((c) => c.id));
  const refNotas = cartoes.filter((c) => c.tipo === "nota" && c.refId).map((c) => c.refId as string);

  const filtro = filtroLeituraDiario(acesso);
  const [fichas, notas, sessoes] = await Promise.all([
    prisma.diarioFicha.findMany({
      where: { mesaId, ...filtro },
      orderBy: { nome: "asc" },
      include: { retratos: { orderBy: { ordem: "asc" }, take: 1 } },
    }),
    // Do jogador e públicas, mais as que algum cartão aponta (se ele puder ler).
    prisma.diarioNota.findMany({
      where: { mesaId, OR: [{ autorId: acesso.userId }, { visibilidade: "publica" }, ...(refNotas.length ? [{ id: { in: refNotas } }] : [])] },
      orderBy: { criadaEm: "desc" },
      take: 400,
    }),
    prisma.sessao.findMany({ where: { mesaId }, orderBy: { iniciadaEm: "desc" } }),
  ]);

  const sessaoAtual = sessoes.find((s) => s.encerradaEm === null) ?? sessoes[0] ?? null;
  return {
    cartoes: cartoes.map(dtoCartao),
    ligacoes: ligacoes.filter((l) => idsCartao.has(l.deId) && idsCartao.has(l.paraId)).map(dtoLigacaoDe),
    paginas: fichas.map((f) => ({
      id: f.id,
      nome: f.nome,
      tipo: normalizarTipoFicha(f.tipo),
      fotoUrl: f.retratos[0]?.url ?? f.retratoUrl ?? null,
      previa: previa(f.resumo, 220),
      visibilidade: f.visibilidade,
      autorId: f.autorId,
    })),
    notas: notas
      .filter((n) => podeLerDiario(acesso, n))
      .map((n) => ({
        id: n.id,
        titulo: n.titulo,
        previa: previa(n.corpo, 240),
        sessaoId: n.sessaoId,
        autorId: n.autorId,
        visibilidade: n.visibilidade,
        criadaEm: n.criadaEm.toISOString(),
      })),
    sessoes: sessoes.map((s) => ({
      id: s.id,
      numero: s.numero,
      titulo: s.titulo,
      ativa: s.encerradaEm === null,
      iniciadaEm: s.iniciadaEm.toISOString(),
    })),
    sessaoAtualId: sessaoAtual?.id ?? null,
  };
}
