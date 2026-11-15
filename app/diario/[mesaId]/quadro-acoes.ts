"use server";

// Cartões e ligações de um quadro. Cada ação confere a permissão no servidor
// (lib/diario-quadro-permissao.ts) e o conteúdo chega pelo canal do quadro (etapa 4).

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { usuarioDaRequest } from "@/lib/supabase/server";
import { ErroDeUso, executar as executarEm } from "@/lib/acoes";
import { acessoAoDiario, filtroLeituraDiario, podeLerDiario, type AcessoDiario } from "@/lib/diario";
import { avisarQuadro } from "@/lib/diario-aovivo";
import { dtoCartaoDe, dtoLigacaoDe, listarLixeira, mudancasDesde } from "@/lib/diario-quadros";
import { podeEditarCartao, podeEditarQuadro, podeOcultarNoQuadro, podeRestaurarCartao, podeVerQuadro, type Compartilhado } from "@/lib/diario-quadro-permissao";
import { limitarGeometria } from "@/lib/diario-quadro-geo";
import {
  LIMITES_QUADRO as L,
  TAMANHO_PADRAO,
  ehAlinhamento,
  ehCorCartao,
  ehCorTexto,
  ehCorLigacao,
  ehFormatoCartao,
  ehNivelAcesso,
  ehTipoCartao,
  ehTipoReferencia,
  ehTracoLigacao,
  FONTE_MAX,
  FONTE_MIN,
  type Alinhamento,
  type CartaoDTO,
  type CorCartao,
  type CorTexto,
  type CorLigacao,
  type FormatoCartao,
  type ItemLixeiraDTO,
  type LigacaoDTO,
  type MudancasQuadroDTO,
  type TipoCartao,
  type TracoLigacao,
} from "@/lib/diario-quadro-tipos";

const executar = <T extends object = object>(corpo: () => Promise<T | void>) => executarEm("diario-quadro", corpo);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_POR_CHAMADA = 200;

async function autorizar(mesaId: string): Promise<AcessoDiario> {
  const user = await usuarioDaRequest();
  if (!user) throw new ErroDeUso("Não autenticado.");
  const acesso = await acessoAoDiario(mesaId, user.id);
  if (!acesso) throw new ErroDeUso("Você não participa desta mesa.");
  return acesso;
}

// O quadro, com a permissão de editar já conferida.
async function quadroEditavel(mesaId: string, quadroId: string, acesso: AcessoDiario) {
  const q = await prisma.diarioQuadro.findFirst({
    where: { id: quadroId, mesaId },
    include: { acessos: { where: { userId: acesso.userId } } },
  });
  if (!q) throw new ErroDeUso("Quadro não encontrado.");
  const nivel = q.acessos[0]?.nivel;
  const comp: Compartilhado = ehNivelAcesso(nivel) ? nivel : null;
  if (!podeEditarQuadro(acesso, q, comp)) throw new ErroDeUso("Você não pode editar este quadro.");
  return { q, comp };
}

// Marca o quadro como mexido e avisa quem está nele (aviso sem conteúdo, depois da resposta).
async function tocar(quadroId: string) {
  await prisma.diarioQuadro.update({ where: { id: quadroId }, data: { atualizadoEm: new Date() } });
  after(() => avisarQuadro(quadroId));
}

function textoCartao(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (typeof v !== "string") throw new ErroDeUso("Texto inválido.");
  if (v.length > L.texto) throw new ErroDeUso(`O texto passa de ${L.texto} caracteres.`);
  return v;
}

// Formatação do texto: valores soltos, cada um validado (fonte nula volta ao tamanho padrão do tipo).
type Formato = { fonte?: number | null; alinhamento?: Alinhamento; corTexto?: CorTexto; negrito?: boolean };

function lerFormato(m: Formato): { fonteTamanho?: number | null; alinhamento?: Alinhamento; corTexto?: CorTexto; negrito?: boolean } {
  const out: { fonteTamanho?: number | null; alinhamento?: Alinhamento; corTexto?: CorTexto; negrito?: boolean } = {};
  if (m.fonte !== undefined) {
    if (m.fonte === null) out.fonteTamanho = null;
    else if (typeof m.fonte === "number" && Number.isFinite(m.fonte)) out.fonteTamanho = Math.max(FONTE_MIN, Math.min(FONTE_MAX, Math.round(m.fonte)));
    else throw new ErroDeUso("Tamanho de fonte inválido.");
  }
  if (m.alinhamento !== undefined) {
    if (!ehAlinhamento(m.alinhamento)) throw new ErroDeUso("Alinhamento inválido.");
    out.alinhamento = m.alinhamento;
  }
  if (m.corTexto !== undefined) {
    if (!ehCorTexto(m.corTexto)) throw new ErroDeUso("Cor de texto inválida.");
    out.corTexto = m.corTexto;
  }
  if (m.negrito !== undefined) out.negrito = m.negrito === true;
  return out;
}

function urlImagem(v: unknown): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string" || v.length > 800 || !/^https?:\/\//i.test(v)) throw new ErroDeUso("Endereço da imagem inválido.");
  return v;
}

function idValido(v: unknown): string {
  if (typeof v !== "string" || !UUID.test(v)) throw new ErroDeUso("Identificador inválido.");
  return v;
}

// A sessão em que as coisas nascem e são reveladas: a ativa, ou a mais recente.
async function sessaoAtual(mesaId: string): Promise<string | null> {
  const s =
    (await prisma.sessao.findFirst({ where: { mesaId, encerradaEm: null }, select: { id: true } })) ??
    (await prisma.sessao.findFirst({ where: { mesaId }, orderBy: { iniciadaEm: "desc" }, select: { id: true } }));
  return s?.id ?? null;
}

// Ocultar guarda só o cadeado; revelar guarda em que sessão a mesa passou a ver ("revelado na Sessão N").
async function dadosDeRevelacao(mesaId: string, oculto: boolean, sessaoId: string | null | undefined) {
  if (oculto) return { oculto: true, reveladoSessaoId: null, reveladoEm: null };
  let id: string | null;
  if (sessaoId) {
    const s = await prisma.sessao.findFirst({ where: { id: sessaoId, mesaId }, select: { id: true } });
    if (!s) throw new ErroDeUso("Sessão não encontrada.");
    id = s.id;
  } else id = await sessaoAtual(mesaId);
  return { oculto: false, reveladoSessaoId: id, reveladoEm: new Date() };
}

// A referência existe nesta mesa e a pessoa pode ler.
async function conferirReferencia(mesaId: string, acesso: AcessoDiario, tipo: TipoCartao, refId: string): Promise<void> {
  if (tipo === "pagina") {
    const f = await prisma.diarioFicha.findFirst({ where: { id: refId, mesaId, ...filtroLeituraDiario(acesso) }, select: { id: true } });
    if (!f) throw new ErroDeUso("Página não encontrada.");
  } else if (tipo === "nota") {
    const n = await prisma.diarioNota.findFirst({ where: { id: refId, mesaId } });
    if (!n || !podeLerDiario(acesso, n)) throw new ErroDeUso("Anotação não encontrada.");
  } else {
    const s = await prisma.sessao.findFirst({ where: { id: refId, mesaId }, select: { id: true } });
    if (!s) throw new ErroDeUso("Sessão não encontrada.");
  }
}

// ─── Cartões ───────────────────────────────────────────────────

export type NovoCartao = {
  // Gerado no navegador: o cartão aparece na hora e o servidor guarda com o mesmo id.
  id: string;
  tipo: TipoCartao;
  x: number;
  y: number;
  largura?: number;
  altura?: number;
  cor?: CorCartao;
  texto?: string;
  refId?: string | null;
  url?: string | null;
  formato?: FormatoCartao;
} & Formato;

export async function criarCartoesQuadro(mesaId: string, quadroId: string, novos: NovoCartao[]) {
  return executar(async () => {
    const acesso = await autorizar(mesaId);
    await quadroEditavel(mesaId, quadroId, acesso);
    if (!Array.isArray(novos) || novos.length === 0) return;
    if (novos.length > MAX_POR_CHAMADA) throw new ErroDeUso("Cartões demais de uma vez.");

    const ativos = await prisma.diarioCartao.count({ where: { quadroId, apagadoEm: null } });
    if (ativos + novos.length > L.cartoes) throw new ErroDeUso(`O quadro chegou a ${L.cartoes} cartões. Apague alguns para criar outros.`);

    const sessao =
      (await prisma.sessao.findFirst({ where: { mesaId, encerradaEm: null }, select: { id: true } })) ??
      (await prisma.sessao.findFirst({ where: { mesaId }, orderBy: { iniciadaEm: "desc" }, select: { id: true } }));

    const dados: Prisma.DiarioCartaoCreateManyInput[] = [];
    for (const n of novos) {
      if (!ehTipoCartao(n.tipo)) throw new ErroDeUso("Tipo de cartão inválido.");
      const padrao = TAMANHO_PADRAO[n.tipo];
      const g = limitarGeometria({ x: n.x, y: n.y, largura: n.largura ?? padrao.largura, altura: n.altura ?? padrao.altura });
      let refId: string | null = null;
      if (ehTipoReferencia(n.tipo)) {
        refId = idValido(n.refId);
        await conferirReferencia(mesaId, acesso, n.tipo, refId);
      }
      dados.push({
        id: idValido(n.id),
        quadroId,
        autorId: acesso.userId,
        tipo: n.tipo,
        formato: ehFormatoCartao(n.formato) ? n.formato : "cartao",
        x: g.x ?? 0,
        y: g.y ?? 0,
        largura: g.largura ?? padrao.largura,
        altura: g.altura ?? padrao.altura,
        cor: ehCorCartao(n.cor) ? n.cor : "amarelo",
        texto: n.tipo === "pagina" || n.tipo === "nota" || n.tipo === "sessao" ? "" : textoCartao(n.texto),
        ...lerFormato(n),
        refId,
        url: n.tipo === "imagem" ? urlImagem(n.url) : null,
        sessaoId: sessao?.id ?? null,
      });
    }
    await prisma.diarioCartao.createMany({ data: dados });
    await tocar(quadroId);
    revalidatePath(`/diario/${mesaId}`);
  });
}

export type MudancaCartao = {
  id: string;
  x?: number;
  y?: number;
  largura?: number;
  altura?: number;
  z?: number;
  cor?: CorCartao;
  texto?: string;
  formato?: FormatoCartao;
  // Só o narrador, no quadro da mesa.
  oculto?: boolean;
  reveladoSessaoId?: string | null;
} & Formato;

export async function atualizarCartoesQuadro(mesaId: string, quadroId: string, mudancas: MudancaCartao[]) {
  return executar(async () => {
    const acesso = await autorizar(mesaId);
    const { q, comp } = await quadroEditavel(mesaId, quadroId, acesso);
    if (!Array.isArray(mudancas) || mudancas.length === 0) return;
    if (mudancas.length > MAX_POR_CHAMADA) throw new ErroDeUso("Mudanças demais de uma vez.");

    const existentes = await prisma.diarioCartao.findMany({
      where: { quadroId, apagadoEm: null, id: { in: mudancas.map((m) => m.id).filter((i) => typeof i === "string") } },
      select: { id: true, oculto: true, tipo: true },
    });
    const porId = new Map(existentes.map((c) => [c.id, c]));

    const ops: Prisma.PrismaPromise<unknown>[] = [];
    for (const m of mudancas) {
      const c = porId.get(m.id);
      // Cartão que sumiu (apagado por outra pessoa) ou que ela não pode mexer: ignora, sem derrubar o resto.
      if (!c || !podeEditarCartao(acesso, q, c, comp)) continue;
      const g = limitarGeometria({ x: m.x, y: m.y, largura: m.largura, altura: m.altura });
      const data: Prisma.DiarioCartaoUpdateInput = { ...g, ...lerFormato(m) };
      if (typeof m.z === "number" && Number.isFinite(m.z)) data.z = Math.max(-1000, Math.min(100000, Math.round(m.z)));
      if (m.cor !== undefined) {
        if (!ehCorCartao(m.cor)) throw new ErroDeUso("Cor inválida.");
        data.cor = m.cor;
      }
      if (m.formato !== undefined) {
        if (!ehFormatoCartao(m.formato)) throw new ErroDeUso("Formato inválido.");
        data.formato = m.formato;
      }
      if (m.oculto !== undefined) {
        if (!podeOcultarNoQuadro(acesso, q)) throw new ErroDeUso("Só o narrador oculta e revela no quadro da mesa.");
        Object.assign(data, await dadosDeRevelacao(mesaId, m.oculto === true, m.reveladoSessaoId));
      }
      if (m.texto !== undefined && !ehTipoReferencia(c.tipo)) data.texto = textoCartao(m.texto);
      ops.push(prisma.diarioCartao.update({ where: { id: c.id }, data }));
    }
    if (ops.length === 0) return;
    await prisma.$transaction(ops);
    await tocar(quadroId);
  });
}

// Vai pra lixeira (volta em alguns dias), junto com as ligações dos cartões.
export async function apagarCartoesQuadro(mesaId: string, quadroId: string, ids: string[]) {
  return executar(async () => {
    const acesso = await autorizar(mesaId);
    const { q, comp } = await quadroEditavel(mesaId, quadroId, acesso);
    if (!Array.isArray(ids) || ids.length === 0) return;
    if (ids.length > MAX_POR_CHAMADA * 5) throw new ErroDeUso("Cartões demais de uma vez.");

    const cartoes = await prisma.diarioCartao.findMany({
      where: { quadroId, apagadoEm: null, id: { in: ids.filter((i) => typeof i === "string") } },
      select: { id: true, oculto: true },
    });
    const permitidos = cartoes.filter((c) => podeEditarCartao(acesso, q, c, comp)).map((c) => c.id);
    if (permitidos.length === 0) return;
    const agora = new Date();
    await prisma.$transaction([
      prisma.diarioCartao.updateMany({ where: { id: { in: permitidos } }, data: { apagadoEm: agora, apagadoPor: acesso.userId } }),
      prisma.diarioLigacao.updateMany({
        where: { quadroId, apagadoEm: null, OR: [{ deId: { in: permitidos } }, { paraId: { in: permitidos } }] },
        data: { apagadoEm: agora },
      }),
    ]);
    await tocar(quadroId);
    revalidatePath(`/diario/${mesaId}`);
  });
}

// ─── Ligações ──────────────────────────────────────────────────

export type DadosLigacao = {
  rotulo?: string;
  cor?: CorLigacao;
  traco?: TracoLigacao;
  seta?: boolean;
  // Só o narrador, no quadro da mesa.
  oculto?: boolean;
  reveladoSessaoId?: string | null;
};

function lerLigacao(d: DadosLigacao) {
  const out: { rotulo?: string; cor?: CorLigacao; traco?: TracoLigacao; seta?: boolean } = {};
  if (d.rotulo !== undefined) {
    if (typeof d.rotulo !== "string" || d.rotulo.length > L.rotulo) throw new ErroDeUso(`O rótulo passa de ${L.rotulo} caracteres.`);
    out.rotulo = d.rotulo.trim();
  }
  if (d.cor !== undefined) {
    if (!ehCorLigacao(d.cor)) throw new ErroDeUso("Cor inválida.");
    out.cor = d.cor;
  }
  if (d.traco !== undefined) {
    if (!ehTracoLigacao(d.traco)) throw new ErroDeUso("Traço inválido.");
    out.traco = d.traco;
  }
  if (d.seta !== undefined) out.seta = d.seta === true;
  return out;
}

export async function criarLigacaoQuadro(mesaId: string, quadroId: string, id: string, deId: string, paraId: string, dados: DadosLigacao = {}) {
  return executar(async () => {
    const acesso = await autorizar(mesaId);
    const { q, comp } = await quadroEditavel(mesaId, quadroId, acesso);
    idValido(id);
    if (deId === paraId) throw new ErroDeUso("Um cartão não se liga a ele mesmo.");
    const pontas = await prisma.diarioCartao.findMany({
      where: { quadroId, apagadoEm: null, id: { in: [deId, paraId] } },
      select: { id: true, oculto: true },
    });
    if (pontas.length !== 2 || pontas.some((c) => !podeEditarCartao(acesso, q, c, comp))) throw new ErroDeUso("Cartão não encontrado.");
    const total = await prisma.diarioLigacao.count({ where: { quadroId, apagadoEm: null } });
    if (total >= L.ligacoes) throw new ErroDeUso(`O quadro chegou a ${L.ligacoes} ligações.`);
    await prisma.diarioLigacao.create({ data: { id, quadroId, deId, paraId, autorId: acesso.userId, ...lerLigacao(dados) } });
    await tocar(quadroId);
  });
}

export async function atualizarLigacaoQuadro(mesaId: string, quadroId: string, id: string, dados: DadosLigacao) {
  return executar(async () => {
    const acesso = await autorizar(mesaId);
    const { q, comp } = await quadroEditavel(mesaId, quadroId, acesso);
    const l = await prisma.diarioLigacao.findFirst({ where: { id, quadroId, apagadoEm: null } });
    if (!l || !podeEditarCartao(acesso, q, l, comp)) throw new ErroDeUso("Ligação não encontrada.");
    let revelacao = {};
    if (dados.oculto !== undefined) {
      if (!podeOcultarNoQuadro(acesso, q)) throw new ErroDeUso("Só o narrador oculta e revela no quadro da mesa.");
      revelacao = await dadosDeRevelacao(mesaId, dados.oculto === true, dados.reveladoSessaoId);
    }
    await prisma.diarioLigacao.update({ where: { id }, data: { ...lerLigacao(dados), ...revelacao } });
    await tocar(quadroId);
  });
}

export async function apagarLigacaoQuadro(mesaId: string, quadroId: string, id: string) {
  return executar(async () => {
    const acesso = await autorizar(mesaId);
    const { q, comp } = await quadroEditavel(mesaId, quadroId, acesso);
    const l = await prisma.diarioLigacao.findFirst({ where: { id, quadroId, apagadoEm: null } });
    if (!l || !podeEditarCartao(acesso, q, l, comp)) throw new ErroDeUso("Ligação não encontrada.");
    await prisma.diarioLigacao.update({ where: { id }, data: { apagadoEm: new Date() } });
    await tocar(quadroId);
  });
}

// ─── Sincronia, lixeira e restaurar ────────────────────────────

// O quadro, só pra ler (quem pode ver; o aviso e a lixeira não pedem poder editar).
async function quadroLegivel(mesaId: string, quadroId: string, acesso: AcessoDiario) {
  const q = await prisma.diarioQuadro.findFirst({
    where: { id: quadroId, mesaId },
    include: { acessos: { where: { userId: acesso.userId } } },
  });
  if (!q) throw new ErroDeUso("Quadro não encontrado.");
  const nivel = q.acessos[0]?.nivel;
  const comp: Compartilhado = ehNivelAcesso(nivel) ? nivel : null;
  if (!podeVerQuadro(acesso, q, comp)) throw new ErroDeUso("Quadro não encontrado.");
  return { q, comp };
}

// O que mudou no quadro desde `desde` (ISO). Chamado ao receber um aviso e ao voltar pra aba.
export async function lerMudancasQuadro(mesaId: string, quadroId: string, desde: string) {
  return executar<{ mudancas: MudancasQuadroDTO }>(async () => {
    const acesso = await autorizar(mesaId);
    await quadroLegivel(mesaId, quadroId, acesso);
    const d = new Date(desde);
    if (Number.isNaN(d.getTime())) throw new ErroDeUso("Data inválida.");
    return { mudancas: await mudancasDesde(mesaId, quadroId, acesso, d) };
  });
}

export async function listarLixeiraQuadro(mesaId: string, quadroId: string) {
  return executar<{ itens: ItemLixeiraDTO[] }>(async () => {
    const acesso = await autorizar(mesaId);
    const { q, comp } = await quadroLegivel(mesaId, quadroId, acesso);
    return { itens: await listarLixeira(quadroId, acesso, q, comp) };
  });
}

// Tira da lixeira (a lixeira e o Ctrl+Z). As ligações que caíram junto com o cartão voltam com ele.
export async function restaurarCartoesQuadro(mesaId: string, quadroId: string, ids: string[], ligacaoIds: string[] = []) {
  return executar<{ cartoes: CartaoDTO[]; ligacoes: LigacaoDTO[] }>(async () => {
    const acesso = await autorizar(mesaId);
    const { q, comp } = await quadroEditavel(mesaId, quadroId, acesso);
    if (!Array.isArray(ids) || ids.length > MAX_POR_CHAMADA) throw new ErroDeUso("Cartões demais de uma vez.");
    const alvo = await prisma.diarioCartao.findMany({ where: { quadroId, apagadoEm: { not: null }, id: { in: ids.filter((i) => typeof i === "string") } } });
    const permitidos = alvo.filter((c) => podeRestaurarCartao(acesso, q, c, comp));

    const ativos = await prisma.diarioCartao.count({ where: { quadroId, apagadoEm: null } });
    if (ativos + permitidos.length > L.cartoes) throw new ErroDeUso(`O quadro chegou a ${L.cartoes} cartões. Apague alguns para restaurar.`);

    const apagadoEm = new Map(permitidos.map((c) => [c.id, (c.apagadoEm as Date).getTime()]));
    const idsPermitidos = permitidos.map((c) => c.id);
    if (idsPermitidos.length > 0) {
      await prisma.diarioCartao.updateMany({ where: { id: { in: idsPermitidos } }, data: { apagadoEm: null, apagadoPor: null } });
    }

    // Ligações: as que caíram junto (mesmo instante) e as pedidas, desde que as duas pontas estejam no quadro.
    const candidatas = await prisma.diarioLigacao.findMany({
      where: {
        quadroId,
        apagadoEm: { not: null },
        OR: [{ deId: { in: idsPermitidos } }, { paraId: { in: idsPermitidos } }, { id: { in: ligacaoIds.filter((i) => typeof i === "string") } }],
      },
    });
    const pontasAtivas = new Set(
      (await prisma.diarioCartao.findMany({ where: { quadroId, apagadoEm: null, id: { in: [...new Set(candidatas.flatMap((l) => [l.deId, l.paraId]))] } }, select: { id: true } })).map((c) => c.id),
    );
    const pedidas = new Set(ligacaoIds);
    const voltam = candidatas.filter((l) => {
      if (!pontasAtivas.has(l.deId) || !pontasAtivas.has(l.paraId)) return false;
      const junto = [l.deId, l.paraId].some((p) => apagadoEm.get(p) === (l.apagadoEm as Date).getTime());
      return junto || pedidas.has(l.id);
    });
    if (voltam.length > 0) await prisma.diarioLigacao.updateMany({ where: { id: { in: voltam.map((l) => l.id) } }, data: { apagadoEm: null } });

    await tocar(quadroId);
    revalidatePath(`/diario/${mesaId}`);
    const cartoes = await prisma.diarioCartao.findMany({ where: { id: { in: idsPermitidos } } });
    const ligacoes = voltam.length ? await prisma.diarioLigacao.findMany({ where: { id: { in: voltam.map((l) => l.id) } } }) : [];
    return { cartoes: cartoes.map(dtoCartaoDe), ligacoes: ligacoes.map(dtoLigacaoDe) };
  });
}
