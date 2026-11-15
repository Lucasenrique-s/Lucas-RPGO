// Regras de permissão dos quadros de investigação, puras (sem banco): servidor,
// tela e testes usam as mesmas.
//
// Quadro da mesa (tipo "mesa"): público. Todos os membros leem, criam, movem,
//   editam e apagam. O narrador renomeia, troca o fundo, oculta e revela, e
//   restaura da lixeira.
// Quadro pessoal (tipo "pessoal"): privado. O dono faz tudo; o narrador também LÊ
//   (a tela avisa, como no resto do diário); quem recebeu acesso "ver" lê e quem
//   recebeu "editar" também mexe nos cartões e ligações. Só o dono renomeia,
//   troca o fundo, compartilha e apaga o quadro.
// Cartão ou ligação oculta (só no quadro da mesa): só o narrador vê e mexe.

import type { NivelAcesso } from "./diario-quadro-tipos";

export type AcessoQuadro = { userId: string; narrador: boolean };

export type QuadroPermissao = { tipo: string; donoId: string | null };

// O acesso que a pessoa recebeu por compartilhamento (null = nenhum).
export type Compartilhado = NivelAcesso | null;

export type ItemOculto = { oculto: boolean };

const daMesa = (q: QuadroPermissao) => q.tipo === "mesa";
const dono = (a: AcessoQuadro, q: QuadroPermissao) => !daMesa(q) && q.donoId === a.userId;

export const podeVerQuadro = (a: AcessoQuadro, q: QuadroPermissao, comp: Compartilhado = null) =>
  daMesa(q) || a.narrador || dono(a, q) || comp !== null;

// Mexe nos cartões e ligações (criar, mover, editar, apagar).
export const podeEditarQuadro = (a: AcessoQuadro, q: QuadroPermissao, comp: Compartilhado = null) =>
  daMesa(q) || dono(a, q) || comp === "editar";

export const podeRenomearQuadro = (a: AcessoQuadro, q: QuadroPermissao) => (daMesa(q) ? a.narrador : dono(a, q));

// Imagem de fundo (o quadro vira mapa).
export const podeTrocarFundo = (a: AcessoQuadro, q: QuadroPermissao) => (daMesa(q) ? a.narrador : dono(a, q));

export const podeCompartilharQuadro = (a: AcessoQuadro, q: QuadroPermissao) => !daMesa(q) && dono(a, q);

// O quadro da mesa não se apaga: há sempre um por mesa.
export const podeApagarQuadro = (a: AcessoQuadro, q: QuadroPermissao) => !daMesa(q) && dono(a, q);

// Ocultar e revelar só existem no quadro da mesa, e só o narrador faz.
export const podeOcultarNoQuadro = (a: AcessoQuadro, q: QuadroPermissao) => daMesa(q) && a.narrador;

// Lixeira: no quadro da mesa só o narrador restaura (evita briga de quem apagou o quê).
export const podeRestaurarDaLixeira = (a: AcessoQuadro, q: QuadroPermissao, comp: Compartilhado = null) =>
  daMesa(q) ? a.narrador : podeEditarQuadro(a, q, comp);

// Restaurar um cartão em particular: quem pode restaurar em geral, ou quem o apagou (é o Ctrl+Z dele, mesmo no
// quadro da mesa onde só o narrador mexe na lixeira). Cartão oculto continua sendo só do narrador.
export const podeRestaurarCartao = (
  a: AcessoQuadro,
  q: QuadroPermissao,
  c: ItemOculto & { apagadoPor: string | null },
  comp: Compartilhado = null,
) =>
  podeVerCartao(a, c) &&
  (podeRestaurarDaLixeira(a, q, comp) || (c.apagadoPor === a.userId && podeEditarQuadro(a, q, comp)));

export const podeVerCartao = (a: AcessoQuadro, c: ItemOculto) => !c.oculto || a.narrador;

export const podeEditarCartao = (a: AcessoQuadro, q: QuadroPermissao, c: ItemOculto, comp: Compartilhado = null) =>
  podeEditarQuadro(a, q, comp) && podeVerCartao(a, c);

// Uma ligação aparece se ela não está oculta e os dois cartões que ela une aparecem.
export const podeVerLigacao = (a: AcessoQuadro, l: ItemOculto, de: ItemOculto, para: ItemOculto) =>
  podeVerCartao(a, l) && podeVerCartao(a, de) && podeVerCartao(a, para);

// Enviar cartões para o quadro da mesa: precisa ler a origem. Escrever no destino todo membro pode.
export const podeEnviarParaMesa = (a: AcessoQuadro, origem: QuadroPermissao, comp: Compartilhado = null) =>
  podeVerQuadro(a, origem, comp);

// O narrador está lendo o quadro privado de outra pessoa (a tela avisa a quem lê).
export const narradorLendoPrivado = (a: AcessoQuadro, q: QuadroPermissao, comp: Compartilhado = null) =>
  a.narrador && !daMesa(q) && !dono(a, q) && comp === null;

// O dono vê o aviso de que o narrador também lê o quadro dele.
export const avisarQueNarradorLe = (q: QuadroPermissao) => !daMesa(q);

export type PermissoesQuadro = {
  ver: boolean;
  editar: boolean;
  renomear: boolean;
  trocarFundo: boolean;
  compartilhar: boolean;
  apagar: boolean;
  ocultar: boolean;
  restaurar: boolean;
  somenteLeitura: boolean;
  narradorLendoPrivado: boolean;
};

// Resumo para a tela decidir o que mostrar (o servidor checa de novo em cada ação).
export function permissoesDoQuadro(a: AcessoQuadro, q: QuadroPermissao, comp: Compartilhado = null): PermissoesQuadro {
  const ver = podeVerQuadro(a, q, comp);
  const editar = ver && podeEditarQuadro(a, q, comp);
  return {
    ver,
    editar,
    renomear: ver && podeRenomearQuadro(a, q),
    trocarFundo: ver && podeTrocarFundo(a, q),
    compartilhar: ver && podeCompartilharQuadro(a, q),
    apagar: ver && podeApagarQuadro(a, q),
    ocultar: ver && podeOcultarNoQuadro(a, q),
    restaurar: ver && podeRestaurarDaLixeira(a, q, comp),
    somenteLeitura: ver && !editar,
    narradorLendoPrivado: ver && narradorLendoPrivado(a, q, comp),
  };
}

// Filtro Prisma dos quadros que a pessoa enxerga na lista.
export type FiltroListaQuadros = {
  OR?: ({ tipo: string } | { donoId: string } | { acessos: { some: { userId: string } } })[];
};

export function filtroListaQuadros(a: AcessoQuadro): FiltroListaQuadros {
  return a.narrador
    ? {}
    : { OR: [{ tipo: "mesa" }, { donoId: a.userId }, { acessos: { some: { userId: a.userId } } }] };
}

// Um cartão apagado só some de vez depois de `dias` dias.
export const vencidaNaLixeira = (apagadoEm: Date, agora: Date, dias: number) =>
  agora.getTime() - apagadoEm.getTime() > dias * 86_400_000;

// A lixeira não conta no limite: quem passa de `limite` não cria mais.
export const cabeNoQuadro = (ativos: number, adicionar: number, limite: number) => ativos + adicionar <= limite;
