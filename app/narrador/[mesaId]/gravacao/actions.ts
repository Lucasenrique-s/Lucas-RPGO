"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { usuarioDaRequest } from "@/lib/supabase/server";
import { gerarTokenGravacao, lerConfigGravacao } from "@/lib/gravacao";

async function exigirNarrador(mesaId: string) {
  const user = await usuarioDaRequest();
  if (!user) throw new Error("Faça login de novo.");
  const mesa = await prisma.mesa.findUnique({ where: { id: mesaId }, select: { userId: true } });
  if (!mesa || mesa.userId !== user.id) throw new Error("Apenas o narrador pode executar esta ação.");
}

/**
 * Grava a config inteira (a tela manda o estado dela). Passa pelo leitor, que
 * descarta o que for inválido; sem revalidate, a tela já mostra o que mandou.
 */
export async function salvarConfigGravacao(mesaId: string, config: unknown) {
  await exigirNarrador(mesaId);
  // Json: o tipo do Prisma não aceita a interface direto.
  const limpa = JSON.parse(JSON.stringify(lerConfigGravacao(config)));
  await prisma.configGravacao.update({ where: { mesaId }, data: { config: limpa } });
}

/** Troca o token: o link antigo do OBS para de funcionar. */
export async function gerarNovoLinkGravacao(mesaId: string) {
  await exigirNarrador(mesaId);
  await prisma.configGravacao.update({ where: { mesaId }, data: { token: gerarTokenGravacao() } });
  revalidatePath(`/narrador/${mesaId}/gravacao`);
}
