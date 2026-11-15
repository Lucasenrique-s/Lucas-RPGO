import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  cabeNoQuadro,
  filtroListaQuadros,
  narradorLendoPrivado,
  permissoesDoQuadro,
  podeApagarQuadro,
  podeEditarCartao,
  podeEditarQuadro,
  podeEnviarParaMesa,
  podeOcultarNoQuadro,
  podeRestaurarCartao,
  podeRestaurarDaLixeira,
  podeVerCartao,
  podeVerLigacao,
  podeVerQuadro,
  vencidaNaLixeira,
} from "./diario-quadro-permissao.ts";

const narrador = { userId: "n", narrador: true };
const ana = { userId: "ana", narrador: false };
const bia = { userId: "bia", narrador: false };
const caio = { userId: "caio", narrador: false };

const mesa = { tipo: "mesa", donoId: null };
const daAna = { tipo: "pessoal", donoId: "ana" };

describe("quadro da mesa", () => {
  it("todos os membros leem e editam", () => {
    for (const p of [narrador, ana, bia]) {
      assert.equal(podeVerQuadro(p, mesa), true);
      assert.equal(podeEditarQuadro(p, mesa), true);
    }
  });

  it("só o narrador renomeia, troca o fundo, oculta e restaura; ninguém apaga o quadro", () => {
    const n = permissoesDoQuadro(narrador, mesa);
    assert.equal(n.renomear, true);
    assert.equal(n.trocarFundo, true);
    assert.equal(n.ocultar, true);
    assert.equal(n.restaurar, true);
    assert.equal(n.apagar, false);
    const j = permissoesDoQuadro(ana, mesa);
    assert.equal(j.renomear, false);
    assert.equal(j.trocarFundo, false);
    assert.equal(j.ocultar, false);
    assert.equal(j.restaurar, false);
    assert.equal(j.apagar, false);
    assert.equal(podeApagarQuadro(narrador, mesa), false);
  });

  it("não é leitura de privado", () => {
    assert.equal(narradorLendoPrivado(narrador, mesa), false);
  });
});

describe("quadro pessoal", () => {
  it("o dono faz tudo, menos ocultar", () => {
    const p = permissoesDoQuadro(ana, daAna);
    assert.deepEqual(
      [p.ver, p.editar, p.renomear, p.trocarFundo, p.compartilhar, p.apagar, p.restaurar, p.ocultar],
      [true, true, true, true, true, true, true, false],
    );
    assert.equal(p.narradorLendoPrivado, false);
  });

  it("outra pessoa sem acesso não vê", () => {
    assert.equal(podeVerQuadro(bia, daAna), false);
    assert.equal(permissoesDoQuadro(bia, daAna).ver, false);
    assert.equal(permissoesDoQuadro(bia, daAna).editar, false);
  });

  it("o narrador lê, mas não edita nem gerencia", () => {
    const p = permissoesDoQuadro(narrador, daAna);
    assert.equal(p.ver, true);
    assert.equal(p.editar, false);
    assert.equal(p.somenteLeitura, true);
    assert.equal(p.renomear, false);
    assert.equal(p.compartilhar, false);
    assert.equal(p.apagar, false);
    assert.equal(p.narradorLendoPrivado, true);
  });

  it("compartilhar com 'ver' só lê", () => {
    const p = permissoesDoQuadro(bia, daAna, "ver");
    assert.equal(p.ver, true);
    assert.equal(p.editar, false);
    assert.equal(p.somenteLeitura, true);
    assert.equal(p.compartilhar, false);
  });

  it("compartilhar com 'editar' mexe nos cartões, mas não gerencia o quadro", () => {
    const p = permissoesDoQuadro(bia, daAna, "editar");
    assert.equal(p.editar, true);
    assert.equal(p.somenteLeitura, false);
    assert.equal(p.restaurar, true);
    assert.equal(p.renomear, false);
    assert.equal(p.trocarFundo, false);
    assert.equal(p.compartilhar, false);
    assert.equal(p.apagar, false);
    assert.equal(p.ocultar, false);
  });

  it("o narrador com acesso compartilhado não é 'lendo privado'", () => {
    assert.equal(narradorLendoPrivado(narrador, daAna, "ver"), false);
  });

  it("um quadro com dono nulo não pertence a ninguém", () => {
    const orfao = { tipo: "pessoal", donoId: null };
    assert.equal(podeEditarQuadro(ana, orfao), false);
  });
});

describe("cartões e ligações ocultos", () => {
  const oculto = { oculto: true };
  const aberto = { oculto: false };

  it("só o narrador vê e edita cartão oculto", () => {
    assert.equal(podeVerCartao(ana, oculto), false);
    assert.equal(podeVerCartao(narrador, oculto), true);
    assert.equal(podeEditarCartao(ana, mesa, oculto), false);
    assert.equal(podeEditarCartao(narrador, mesa, oculto), true);
    assert.equal(podeEditarCartao(ana, mesa, aberto), true);
  });

  it("a ligação some se ela ou uma das pontas está oculta", () => {
    assert.equal(podeVerLigacao(ana, aberto, aberto, aberto), true);
    assert.equal(podeVerLigacao(ana, oculto, aberto, aberto), false);
    assert.equal(podeVerLigacao(ana, aberto, oculto, aberto), false);
    assert.equal(podeVerLigacao(ana, aberto, aberto, oculto), false);
    assert.equal(podeVerLigacao(narrador, oculto, oculto, oculto), true);
  });

  it("só o narrador oculta, e só no quadro da mesa", () => {
    assert.equal(podeOcultarNoQuadro(narrador, mesa), true);
    assert.equal(podeOcultarNoQuadro(ana, mesa), false);
    assert.equal(podeOcultarNoQuadro(narrador, daAna), false);
  });
});

describe("lixeira", () => {
  it("no quadro da mesa só o narrador restaura; no pessoal, quem edita", () => {
    assert.equal(podeRestaurarDaLixeira(ana, mesa), false);
    assert.equal(podeRestaurarDaLixeira(narrador, mesa), true);
    assert.equal(podeRestaurarDaLixeira(ana, daAna), true);
    assert.equal(podeRestaurarDaLixeira(bia, daAna, "ver"), false);
    assert.equal(podeRestaurarDaLixeira(bia, daAna, "editar"), true);
  });

  it("quem apagou restaura o seu (Ctrl+Z), mesmo no quadro da mesa; o dos outros, só o narrador", () => {
    const meu = { oculto: false, apagadoPor: "ana" };
    const dele = { oculto: false, apagadoPor: "bia" };
    assert.equal(podeRestaurarCartao(ana, mesa, meu), true);
    assert.equal(podeRestaurarCartao(ana, mesa, dele), false);
    assert.equal(podeRestaurarCartao(narrador, mesa, dele), true);
    // Quadro pessoal: quem só pode ver não restaura nem o que apagou antes de perder o acesso.
    assert.equal(podeRestaurarCartao(bia, daAna, { oculto: false, apagadoPor: "bia" }, "ver"), false);
    assert.equal(podeRestaurarCartao(bia, daAna, { oculto: false, apagadoPor: "ana" }, "editar"), true);
  });

  it("cartão oculto apagado só o narrador restaura", () => {
    assert.equal(podeRestaurarCartao(ana, mesa, { oculto: true, apagadoPor: "ana" }), false);
    assert.equal(podeRestaurarCartao(narrador, mesa, { oculto: true, apagadoPor: "ana" }), true);
  });

  it("vence depois de N dias", () => {
    const agora = new Date("2026-11-15T12:00:00Z");
    assert.equal(vencidaNaLixeira(new Date("2026-11-09T12:00:01Z"), agora, 7), false);
    assert.equal(vencidaNaLixeira(new Date("2026-11-08T11:59:59Z"), agora, 7), true);
  });
});

describe("importar e lista", () => {
  it("enviar para o quadro da mesa exige ler a origem", () => {
    assert.equal(podeEnviarParaMesa(ana, daAna), true);
    assert.equal(podeEnviarParaMesa(bia, daAna), false);
    assert.equal(podeEnviarParaMesa(bia, daAna, "ver"), true);
  });

  it("o filtro da lista: narrador vê todos; jogador, o da mesa, os seus e os compartilhados", () => {
    assert.deepEqual(filtroListaQuadros(narrador), {});
    assert.deepEqual(filtroListaQuadros(caio), {
      OR: [{ tipo: "mesa" }, { donoId: "caio" }, { acessos: { some: { userId: "caio" } } }],
    });
  });

  it("limite de cartões", () => {
    assert.equal(cabeNoQuadro(2999, 1, 3000), true);
    assert.equal(cabeNoQuadro(2999, 2, 3000), false);
  });
});
