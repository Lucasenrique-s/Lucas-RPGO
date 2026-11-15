"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { avisarQuadro } from "@/lib/diario-aovivo";
import { prisma } from "@/lib/prisma";
import { usuarioDaRequest } from "@/lib/supabase/server";
import { ErroDeUso, executar as executarEm } from "@/lib/acoes";
import { acessoAoDiario, type AcessoDiario } from "@/lib/diario";
import { podeApagarQuadro, podeCompartilharQuadro, podeRenomearQuadro, podeTrocarFundo, type Compartilhado } from "@/lib/diario-quadro-permissao";
import { LIMITES_QUADRO as L, ehNivelAcesso, type AcessoCompartilhadoDTO, type NivelAcesso } from "@/lib/diario-quadro-tipos";

const executar = <T extends object = object>(corpo: () => Promise<T | void>) => executarEm("diario-quadros", corpo);

async function autorizar(mesaId: string): Promise<AcessoDiario> {
  const user = await usuarioDaRequest();
  if (!user) throw new ErroDeUso("Não autenticado.");
  const acesso = await acessoAoDiario(mesaId, user.id);
  if (!acesso) throw new ErroDeUso("Você não participa desta mesa.");
  return acesso;
}

const revalidar = (mesaId: string, quadroId?: string) => {
  revalidatePath(`/diario/${mesaId}`);
  if (quadroId) revalidatePath(`/diario/${mesaId}/quadros/${quadroId}`);
};

function nomeValido(v: unknown): string {
  if (typeof v !== "string") throw new ErroDeUso("Nome inválido.");
  const t = v.trim().replace(/\s+/g, " ");
  if (!t) throw new ErroDeUso("Dê um nome ao quadro.");
  if (t.length > L.nome) throw new ErroDeUso(`O nome passa de ${L.nome} caracteres.`);
  return t;
}

// Quadro da mesa que a pessoa pode ver, com o acesso compartilhado dela (se houver).
async function quadroDaPessoa(mesaId: string, quadroId: string, userId: string) {
  const q = await prisma.diarioQuadro.findFirst({
    where: { id: quadroId, mesaId },
    include: { acessos: { where: { userId } } },
  });
  if (!q) throw new ErroDeUso("Quadro não encontrado.");
  const nivel = q.acessos[0]?.nivel;
  const comp: Compartilhado = ehNivelAcesso(nivel) ? nivel : null;
  return { q, comp };
}

export async function criarQuadroDiario(mesaId: string, nome: string) {
  return executar(async () => {
    const acesso = await autorizar(mesaId);
    const n = nomeValido(nome);
    const meus = await prisma.diarioQuadro.count({ where: { mesaId, tipo: "pessoal", donoId: acesso.userId } });
    if (meus >= L.quadrosPorPessoa) throw new ErroDeUso(`Você já tem ${L.quadrosPorPessoa} quadros nesta mesa. Apague algum para criar outro.`);
    const q = await prisma.diarioQuadro.create({
      data: { mesaId, tipo: "pessoal", donoId: acesso.userId, nome: n },
      select: { id: true },
    });
    revalidar(mesaId);
    return { id: q.id };
  });
}

export async function renomearQuadroDiario(mesaId: string, quadroId: string, nome: string) {
  return executar(async () => {
    const acesso = await autorizar(mesaId);
    const n = nomeValido(nome);
    const { q } = await quadroDaPessoa(mesaId, quadroId, acesso.userId);
    if (!podeRenomearQuadro(acesso, q)) throw new ErroDeUso("Você não pode renomear este quadro.");
    await prisma.diarioQuadro.update({ where: { id: q.id }, data: { nome: n } });
    revalidar(mesaId, q.id);
  });
}

export async function apagarQuadroDiario(mesaId: string, quadroId: string) {
  return executar(async () => {
    const acesso = await autorizar(mesaId);
    const { q } = await quadroDaPessoa(mesaId, quadroId, acesso.userId);
    if (!podeApagarQuadro(acesso, q)) {
      throw new ErroDeUso(q.tipo === "mesa" ? "O quadro da mesa não pode ser apagado." : "Só quem criou o quadro pode apagá-lo.");
    }
    // Cartões e ligações saem junto (cascata no banco).
    await prisma.diarioQuadro.delete({ where: { id: q.id } });
    revalidar(mesaId);
  });
}

// ─── Compartilhar (quadro pessoal, por pessoa) ─────────────────

// Quem tem acesso ao quadro além do dono. Só o dono vê e mexe nisso.
export async function listarAcessosQuadro(mesaId: string, quadroId: string) {
  return executar<{ acessos: AcessoCompartilhadoDTO[] }>(async () => {
    const acesso = await autorizar(mesaId);
    const { q } = await quadroDaPessoa(mesaId, quadroId, acesso.userId);
    if (!podeCompartilharQuadro(acesso, q)) throw new ErroDeUso("Só o dono compartilha o quadro.");
    const linhas = await prisma.diarioQuadroAcesso.findMany({ where: { quadroId }, orderBy: { criadoEm: "asc" } });
    return { acessos: linhas.flatMap((l) => (ehNivelAcesso(l.nivel) ? [{ userId: l.userId, nivel: l.nivel }] : [])) };
  });
}

// Dá "ver" ou "editar" a uma pessoa da mesa, ou tira o acesso (nivel null).
export async function definirAcessoQuadro(mesaId: string, quadroId: string, userId: string, nivel: NivelAcesso | null) {
  return executar(async () => {
    const acesso = await autorizar(mesaId);
    const { q } = await quadroDaPessoa(mesaId, quadroId, acesso.userId);
    if (!podeCompartilharQuadro(acesso, q)) throw new ErroDeUso("Só o dono compartilha o quadro.");
    if (typeof userId !== "string" || userId === acesso.userId) throw new ErroDeUso("Escolha outra pessoa da mesa.");
    if (nivel === null) {
      await prisma.diarioQuadroAcesso.deleteMany({ where: { quadroId, userId } });
    } else {
      if (!ehNivelAcesso(nivel)) throw new ErroDeUso("Acesso inválido.");
      if (!(await acessoAoDiario(mesaId, userId))) throw new ErroDeUso("Essa pessoa não participa da mesa.");
      const ja = await prisma.diarioQuadroAcesso.count({ where: { quadroId } });
      const jaTem = await prisma.diarioQuadroAcesso.findUnique({ where: { quadroId_userId: { quadroId, userId } }, select: { userId: true } });
      if (!jaTem && ja >= L.acessos) throw new ErroDeUso(`No máximo ${L.acessos} pessoas por quadro.`);
      await prisma.diarioQuadroAcesso.upsert({
        where: { quadroId_userId: { quadroId, userId } },
        create: { quadroId, userId, nivel },
        update: { nivel },
      });
    }
    revalidar(mesaId, quadroId);
  });
}

// Imagem de fundo: o quadro vira mapa (as páginas de Local viram alfinetes). Quem troca: o dono, ou o narrador no
// quadro da mesa. Sem url, tira o mapa.
export async function definirFundoQuadro(mesaId: string, quadroId: string, fundo: { url: string; largura: number; altura: number } | null) {
  return executar(async () => {
    const acesso = await autorizar(mesaId);
    const { q } = await quadroDaPessoa(mesaId, quadroId, acesso.userId);
    if (!podeTrocarFundo(acesso, q)) throw new ErroDeUso(q.tipo === "mesa" ? "Só o narrador troca o mapa do quadro da mesa." : "Só o dono troca o mapa.");
    if (fundo === null) {
      await prisma.diarioQuadro.update({ where: { id: q.id }, data: { fundoUrl: null, fundoLargura: null, fundoAltura: null } });
    } else {
      if (typeof fundo.url !== "string" || fundo.url.length > 800 || !/^https?:\/\//i.test(fundo.url)) throw new ErroDeUso("Endereço da imagem inválido.");
      const ok = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 1 && n <= 20000;
      if (!ok(fundo.largura) || !ok(fundo.altura)) throw new ErroDeUso("Tamanho da imagem inválido.");
      await prisma.diarioQuadro.update({
        where: { id: q.id },
        data: { fundoUrl: fundo.url, fundoLargura: Math.round(fundo.largura), fundoAltura: Math.round(fundo.altura) },
      });
    }
    revalidar(mesaId, q.id);
    after(() => avisarQuadro(q.id));
  });
}
