import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { caminhoMaisCurto, combinaBusca, componenteDe, visivelNaCamada } from "./diario-quadro-vista.ts";

// a — b — c — d     e — f      g sozinho
const ligacoes = [
  { id: "ab", de: "a", para: "b" },
  { id: "cb", de: "c", para: "b" },
  { id: "cd", de: "c", para: "d" },
  { id: "ef", de: "e", para: "f" },
];

describe("componenteDe", () => {
  it("segue o fio nos dois sentidos, direta e indiretamente", () => {
    const r = componenteDe("a", ligacoes);
    assert.deepEqual([...r.nos].sort(), ["a", "b", "c", "d"]);
    assert.deepEqual([...r.ligacoes].sort(), ["ab", "cb", "cd"]);
  });
  it("cartão sem ligação é só ele", () => {
    const r = componenteDe("g", ligacoes);
    assert.deepEqual([...r.nos], ["g"]);
    assert.equal(r.ligacoes.size, 0);
  });
});

describe("caminhoMaisCurto", () => {
  it("acha o caminho e as ligações dele, mesmo contra a seta", () => {
    assert.deepEqual(caminhoMaisCurto("a", "d", ligacoes), { nos: ["a", "b", "c", "d"], ligacoes: ["ab", "cb", "cd"] });
    assert.deepEqual(caminhoMaisCurto("d", "a", ligacoes), { nos: ["d", "c", "b", "a"], ligacoes: ["cd", "cb", "ab"] });
  });
  it("prefere o atalho", () => {
    const l = [...ligacoes, { id: "ad", de: "a", para: "d" }];
    assert.deepEqual(caminhoMaisCurto("a", "d", l), { nos: ["a", "d"], ligacoes: ["ad"] });
  });
  it("sem caminho dá null; o mesmo cartão dá ele mesmo", () => {
    assert.equal(caminhoMaisCurto("a", "e", ligacoes), null);
    assert.deepEqual(caminhoMaisCurto("a", "a", ligacoes), { nos: ["a"], ligacoes: [] });
  });
  it("ciclo não trava", () => {
    const ciclo = [
      { id: "1", de: "x", para: "y" },
      { id: "2", de: "y", para: "z" },
      { id: "3", de: "z", para: "x" },
    ];
    assert.deepEqual(caminhoMaisCurto("x", "z", ciclo)?.nos, ["x", "z"]);
  });
});

describe("visivelNaCamada", () => {
  const ordem = ["s1", "s2", "s3"];
  it("mostra até a sessão escolhida", () => {
    assert.equal(visivelNaCamada("s1", ordem, 1), true);
    assert.equal(visivelNaCamada("s2", ordem, 1), true);
    assert.equal(visivelNaCamada("s3", ordem, 1), false);
  });
  it("sem limite mostra tudo; sem sessão sempre aparece", () => {
    assert.equal(visivelNaCamada("s3", ordem, null), true);
    assert.equal(visivelNaCamada(null, ordem, 0), true);
  });
  it("sessão desconhecida (apagada) não esconde o cartão", () => {
    assert.equal(visivelNaCamada("sX", ordem, 0), true);
  });
});

describe("combinaBusca", () => {
  it("ignora acento e caixa", () => {
    assert.equal(combinaBusca("Quem viu o CAPITÃO?", "capitao"), true);
    assert.equal(combinaBusca("Zoro", "luffy"), false);
  });
  it("busca vazia não casa com nada", () => {
    assert.equal(combinaBusca("qualquer coisa", "  "), false);
  });
});
