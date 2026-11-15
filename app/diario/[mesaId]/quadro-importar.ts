"use server";

// Mandar cartões de um quadro para o quadro da mesa (cópia independente) e pendurar uma página da wiki num quadro.

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { usuarioDaRequest } from "@/lib/supabase/server";
import { ErroDeUso, executar as executarEm } from "@/lib/acoes";
import { acessoAoDiario, filtroLeituraDiario, podeLerDiario, type AcessoDiario } from "@/lib/diario";
import { avisarQuadro } from "@/lib/diario-aovivo";
import { garantirQuadroDaMesa } from "@/lib/diario-quadros";
import { podeEditarQuadro, podeEnviarParaMesa, podeVerCartao, podeVerQuadro, type Compartilhado } from "@/lib/diario-quadro-permissao";
import { deslocamentoParaColar } from "@/lib/diario-quadro-geo";
import {
  LIMITES_QUADRO as L,
  TAMANHO_PADRAO,
  ehNivelAcesso,
  ehTipoReferencia,
  type PreparoImportacaoDTO,
  type ResultadoImportacaoDTO,
} from "@/lib/diario-quadro-tipos";
import { publicarFichaDiario, publicarNotaDiario } from "./actions";

const executar = <T extends object = object>(corpo: () => Promise<T | void>) => executarEm("diario-quadro-importar", corpo);

async function autorizar(mesaId: string): Promise<AcessoDiario> {
  const user = await usuarioDaRequest();
  if (!user) throw new ErroDeUso("Não autenticado.");
  const acesso = await acessoAoDiario(mesaId, user.id);
  if (!acesso) throw new ErroDeUso("Você não participa desta mesa.");
  return acesso;
}

async function quadroDe(mesaId: string, quadroId: string, acesso: AcessoDiario) {
  const q = await prisma.diarioQuadro.findFirst({ where: { id: quadroId, mesaId }, include: { acessos: { where: { userId: acesso.userId } } } });
  if (!q) throw new ErroDeUso("Quadro não encontrado.");
  const nivel = q.acessos[0]?.nivel;
  const comp: Compartilhado = ehNivelAcesso(nivel) ? nivel : null;
  if (!podeVerQuadro(acesso, q, comp)) throw new ErroDeUso("Quadro não encontrado.");
  return { q, comp };
}

type Linha = Prisma.DiarioCartaoGetPayload<object>;

type Analise = {
  destinoId: string;
  selecionados: Linha[];
  comuns: Linha[];
  // Cartão enviado -> cartão que já está no quadro da mesa.
  reutilizados: Map<string, string>;
  ocultos: Set<string>;
  inacessiveis: Linha[];
  privados: { cartao: Linha; tipo: "pagina" | "nota"; refId: string; nome: string; podePublicar: boolean }[];
  nomesReutilizados: string[];
};

// Separa o que vai direto, o que já está no quadro da mesa, o que é privado e o que não dá pra enviar.
async function analisar(mesaId: string, acesso: AcessoDiario, origemId: string, ids: string[]): Promise<Analise> {
  await garantirQuadroDaMesa(mesaId);
  const destino = await prisma.diarioQuadro.findFirst({ where: { mesaId, tipo: "mesa" }, select: { id: true } });
  if (!destino) throw new ErroDeUso("Quadro da mesa não encontrado.");

  if (!Array.isArray(ids) || ids.length === 0) throw new ErroDeUso("Escolha ao menos um cartão.");
  if (ids.length > L.cartoes) throw new ErroDeUso("Cartões demais de uma vez.");
  const linhas = await prisma.diarioCartao.findMany({ where: { quadroId: origemId, apagadoEm: null, id: { in: ids.filter((i) => typeof i === "string") } } });
  const selecionados = linhas.filter((c) => podeVerCartao(acesso, c));

  const refs = (tipo: string) => [...new Set(selecionados.filter((c) => c.tipo === tipo && c.refId).map((c) => c.refId as string))];
  const [fichas, notas, sessoes, jaLa] = await Promise.all([
    prisma.diarioFicha.findMany({ where: { mesaId, id: { in: refs("pagina") }, ...filtroLeituraDiario(acesso) } }),
    prisma.diarioNota.findMany({ where: { mesaId, id: { in: refs("nota") } } }),
    prisma.sessao.findMany({ where: { mesaId, id: { in: refs("sessao") } }, select: { id: true } }),
    prisma.diarioCartao.findMany({
      where: { quadroId: destino.id, apagadoEm: null, oculto: false, refId: { in: selecionados.flatMap((c) => (c.refId ? [c.refId] : [])) } },
      select: { id: true, tipo: true, refId: true },
    }),
  ]);
  const fichaPorId = new Map(fichas.map((f) => [f.id, f]));
  const notaPorId = new Map(notas.filter((n) => podeLerDiario(acesso, n)).map((n) => [n.id, n]));
  const sessaoOk = new Set(sessoes.map((s) => s.id));
  const existente = new Map(jaLa.map((c) => [`${c.tipo}:${c.refId}`, c.id]));

  const a: Analise = { destinoId: destino.id, selecionados, comuns: [], reutilizados: new Map(), ocultos: new Set(), inacessiveis: [], privados: [], nomesReutilizados: [] };
  for (const c of selecionados) {
    if (!ehTipoReferencia(c.tipo) || !c.refId) {
      a.comuns.push(c);
      continue;
    }
    const ja = existente.get(`${c.tipo}:${c.refId}`);
    const nome = c.tipo === "pagina" ? fichaPorId.get(c.refId)?.nome : c.tipo === "nota" ? (notaPorId.get(c.refId)?.titulo ?? "Anotação") : "Sessão";
    if (ja) {
      a.reutilizados.set(c.id, ja);
      a.nomesReutilizados.push(nome ?? "Cartão");
      continue;
    }
    if (c.tipo === "sessao") {
      (sessaoOk.has(c.refId) ? a.comuns : a.inacessiveis).push(c);
    } else if (c.tipo === "pagina") {
      const f = fichaPorId.get(c.refId);
      if (!f) a.inacessiveis.push(c);
      else if (f.visibilidade === "publica") a.comuns.push(c);
      else if (f.visibilidade === "oculta") {
        a.comuns.push(c);
        a.ocultos.add(c.id);
      } else a.privados.push({ cartao: c, tipo: "pagina", refId: f.id, nome: f.nome, podePublicar: f.autorId === acesso.userId });
    } else {
      const n = notaPorId.get(c.refId);
      if (!n) a.inacessiveis.push(c);
      else if (n.visibilidade === "publica") a.comuns.push(c);
      else a.privados.push({ cartao: c, tipo: "nota", refId: n.id, nome: n.titulo ?? (n.corpo.replace(/\s+/g, " ").slice(0, 40) || "Anotação"), podePublicar: n.autorId === acesso.userId });
    }
  }
  return a;
}

async function origemEnviavel(mesaId: string, quadroId: string, acesso: AcessoDiario) {
  const { q, comp } = await quadroDe(mesaId, quadroId, acesso);
  if (q.tipo === "mesa") throw new ErroDeUso("Estes cartões já estão no quadro da mesa.");
  if (!podeEnviarParaMesa(acesso, q, comp)) throw new ErroDeUso("Você não pode enviar cartões deste quadro.");
  return q;
}

// Antes de copiar: o que vai, o que já está lá e o que é privado (o autor escolhe publicar ou deixar de fora).
export async function prepararImportacaoQuadro(mesaId: string, quadroId: string, ids: string[]) {
  return executar<{ preparo: PreparoImportacaoDTO }>(async () => {
    const acesso = await autorizar(mesaId);
    await origemEnviavel(mesaId, quadroId, acesso);
    const a = await analisar(mesaId, acesso, quadroId, ids);
    return {
      preparo: {
        total: a.selecionados.length,
        comuns: a.comuns.length,
        jaNoQuadro: a.nomesReutilizados,
        ocultos: a.ocultos.size,
        inacessiveis: a.inacessiveis.length,
        privados: a.privados.map((p) => ({ cartaoId: p.cartao.id, tipo: p.tipo, nome: p.nome, podePublicar: p.podePublicar })),
      },
    };
  });
}

export type DecisaoPrivado = "publicar" | "fora";

// Copia os cartões (e as ligações entre eles) para o quadro da mesa, mantendo a posição relativa. A cópia é
// independente: mexer num não muda o outro. Os privados só vão se o autor mandar publicar.
export async function importarParaQuadroDaMesa(mesaId: string, quadroId: string, ids: string[], decisoes: Record<string, DecisaoPrivado>) {
  return executar<{ resultado: ResultadoImportacaoDTO }>(async () => {
    const acesso = await autorizar(mesaId);
    await origemEnviavel(mesaId, quadroId, acesso);
    const a = await analisar(mesaId, acesso, quadroId, ids);

    // 1. Privados: publica o que o autor mandou (só ele pode); o resto fica de fora.
    const entram = new Set(a.comuns.map((c) => c.id));
    let publicados = 0;
    let deixados = a.inacessiveis.length;
    for (const p of a.privados) {
      if (decisoes?.[p.cartao.id] !== "publicar" || !p.podePublicar) {
        deixados++;
        continue;
      }
      const r = p.tipo === "pagina" ? await publicarFichaDiario(mesaId, p.refId, "publica") : await publicarNotaDiario(mesaId, p.refId, "publica");
      // Falha, ou já existe página pública com esse nome (o fluxo de mesclar é da wiki): fica de fora.
      if (!r.ok || ("conflito" in r && r.conflito)) {
        deixados++;
        continue;
      }
      publicados++;
      entram.add(p.cartao.id);
    }

    const copiar = a.selecionados.filter((c) => entram.has(c.id));
    const destinoId = a.destinoId;
    const ativos = await prisma.diarioCartao.count({ where: { quadroId: destinoId, apagadoEm: null } });
    if (ativos + copiar.length > L.cartoes) throw new ErroDeUso(`O quadro da mesa chegaria a mais de ${L.cartoes} cartões.`);

    // 2. Onde caem: à direita do que já existe lá, com a mesma forma de antes.
    const existentes = await prisma.diarioCartao.findMany({ where: { quadroId: destinoId, apagadoEm: null }, select: { x: true, y: true, largura: true, altura: true } });
    const d = deslocamentoParaColar(copiar, existentes);

    const sessao =
      (await prisma.sessao.findFirst({ where: { mesaId, encerradaEm: null }, select: { id: true } })) ??
      (await prisma.sessao.findFirst({ where: { mesaId }, orderBy: { iniciadaEm: "desc" }, select: { id: true } }));
    const novoId = new Map<string, string>();
    for (const c of copiar) novoId.set(c.id, crypto.randomUUID());

    const cartoes: Prisma.DiarioCartaoCreateManyInput[] = copiar.map((c) => ({
      id: novoId.get(c.id) as string,
      quadroId: destinoId,
      autorId: acesso.userId,
      tipo: c.tipo,
      formato: c.formato,
      x: c.x + d.x,
      y: c.y + d.y,
      largura: c.largura,
      altura: c.altura,
      cor: c.cor,
      texto: c.texto,
      fonteTamanho: c.fonteTamanho,
      alinhamento: c.alinhamento,
      corTexto: c.corTexto,
      negrito: c.negrito,
      refId: c.refId,
      url: c.url,
      sessaoId: sessao?.id ?? null,
      // Página oculta continua oculta: o narrador revela quando quiser.
      oculto: a.ocultos.has(c.id),
    }));

    // 3. Ligações: as que unem dois cartões que foram (ou que já estavam lá). As pontas viram os cartões do destino.
    const destinoDe = (id: string) => novoId.get(id) ?? a.reutilizados.get(id);
    const ligOrigem = await prisma.diarioLigacao.findMany({ where: { quadroId, apagadoEm: null } });
    const jaLigados = new Set(
      (await prisma.diarioLigacao.findMany({ where: { quadroId: destinoId, apagadoEm: null }, select: { deId: true, paraId: true } })).map((l) => `${l.deId}>${l.paraId}`),
    );
    const vistos = new Set<string>();
    const ligacoes: Prisma.DiarioLigacaoCreateManyInput[] = [];
    for (const l of ligOrigem) {
      const de = destinoDe(l.deId);
      const para = destinoDe(l.paraId);
      if (!de || !para || de === para) continue;
      // Entre dois cartões que já existiam no destino só vale se a pessoa não ligou antes.
      const chave = `${de}>${para}`;
      if (jaLigados.has(chave) || vistos.has(chave)) continue;
      vistos.add(chave);
      ligacoes.push({ id: crypto.randomUUID(), quadroId: destinoId, deId: de, paraId: para, autorId: acesso.userId, rotulo: l.rotulo, cor: l.cor, traco: l.traco, seta: l.seta });
    }
    const totalLig = await prisma.diarioLigacao.count({ where: { quadroId: destinoId, apagadoEm: null } });
    if (totalLig + ligacoes.length > L.ligacoes) throw new ErroDeUso(`O quadro da mesa chegaria a mais de ${L.ligacoes} ligações.`);

    await prisma.$transaction([
      prisma.diarioCartao.createMany({ data: cartoes }),
      prisma.diarioLigacao.createMany({ data: ligacoes }),
      prisma.diarioQuadro.update({ where: { id: destinoId }, data: { atualizadoEm: new Date() } }),
    ]);
    after(() => avisarQuadro(destinoId));
    revalidatePath(`/diario/${mesaId}`);
    return { resultado: { destinoId, criados: cartoes.length, reutilizados: a.reutilizados.size, ligacoes: ligacoes.length, publicados, deixadosDeFora: deixados } };
  });
}

// "Adicionar ao quadro" na página da wiki: pendura um cartão da página, à direita do que já existe.
export async function adicionarPaginaAoQuadro(mesaId: string, quadroId: string, fichaId: string) {
  return executar<{ quadroId: string }>(async () => {
    const acesso = await autorizar(mesaId);
    const { q, comp } = await quadroDe(mesaId, quadroId, acesso);
    if (!podeEditarQuadro(acesso, q, comp)) throw new ErroDeUso("Você não pode editar este quadro.");
    const f = await prisma.diarioFicha.findFirst({ where: { id: fichaId, mesaId, ...filtroLeituraDiario(acesso) }, select: { id: true } });
    if (!f) throw new ErroDeUso("Página não encontrada.");
    const ativos = await prisma.diarioCartao.count({ where: { quadroId, apagadoEm: null } });
    if (ativos >= L.cartoes) throw new ErroDeUso(`O quadro chegou a ${L.cartoes} cartões.`);

    const t = TAMANHO_PADRAO.pagina;
    const existentes = await prisma.diarioCartao.findMany({ where: { quadroId, apagadoEm: null }, select: { x: true, y: true, largura: true, altura: true } });
    const d = deslocamentoParaColar([{ x: 0, y: 0, largura: t.largura, altura: t.altura }], existentes);
    const sessao =
      (await prisma.sessao.findFirst({ where: { mesaId, encerradaEm: null }, select: { id: true } })) ??
      (await prisma.sessao.findFirst({ where: { mesaId }, orderBy: { iniciadaEm: "desc" }, select: { id: true } }));
    await prisma.diarioCartao.create({
      data: { id: crypto.randomUUID(), quadroId, autorId: acesso.userId, tipo: "pagina", x: d.x, y: d.y, largura: t.largura, altura: t.altura, refId: f.id, sessaoId: sessao?.id ?? null },
    });
    await prisma.diarioQuadro.update({ where: { id: quadroId }, data: { atualizadoEm: new Date() } });
    after(() => avisarQuadro(quadroId));
    revalidatePath(`/diario/${mesaId}`);
    return { quadroId };
  });
}
