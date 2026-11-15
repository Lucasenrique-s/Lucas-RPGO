"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { usuarioDaRequest } from "@/lib/supabase/server";
import { ErroDeUso, executar as executarEm } from "@/lib/acoes";
import { acessoAoDiario, type AcessoDiario } from "@/lib/diario";
import { podeApagarQuadro, podeRenomearQuadro, type Compartilhado } from "@/lib/diario-quadro-permissao";
import { LIMITES_QUADRO as L, ehNivelAcesso } from "@/lib/diario-quadro-tipos";

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
