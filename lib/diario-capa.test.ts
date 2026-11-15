import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CAPAS, CAPA_PADRAO, corDaCapa, corValida, estiloDaCapa, luminancia } from "./diario-capa.ts";

describe("corValida / corDaCapa", () => {
  it("aceita só #rrggbb", () => {
    assert.equal(corValida("#7b1e2b"), true);
    assert.equal(corValida("#7B1E2B"), true);
    for (const ruim of ["7b1e2b", "#fff", "#7b1e2bff", "red", "url(x)", "#7b1e2b; color: red", "", null, undefined, 12]) {
      assert.equal(corValida(ruim), false, String(ruim));
    }
  });

  it("valor estranho cai na capa padrão e o hex sai em minúsculas", () => {
    assert.equal(corDaCapa("javascript:alert(1)"), CAPA_PADRAO);
    assert.equal(corDaCapa(null), CAPA_PADRAO);
    assert.equal(corDaCapa("#7B1E2B"), "#7b1e2b");
  });

  it("toda cor da paleta é válida e única", () => {
    assert.ok(CAPAS.every((c) => corValida(c.cor)));
    assert.equal(new Set(CAPAS.map((c) => c.cor)).size, CAPAS.length);
  });
});

describe("estiloDaCapa", () => {
  it("a capa é a cor escolhida e a moldura é mais escura", () => {
    const e = estiloDaCapa("#7b1e2b");
    assert.equal(e["--capa-2"], "#7b1e2b");
    assert.ok(luminancia(e["--capa"]) < luminancia("#7b1e2b"));
    assert.ok(Object.values(e).every((v) => /^#[0-9a-f]{6}$/.test(v)));
  });

  it("capa escura leva texto claro e capa clara leva texto escuro", () => {
    assert.ok(luminancia(estiloDaCapa("#1f2328")["--capa-texto"]) > 0.5);
    assert.ok(luminancia(estiloDaCapa("#e8e2d0")["--capa-texto"]) < 0.1);
  });

  it("cor inválida vira o estilo da capa padrão", () => {
    assert.deepEqual(estiloDaCapa("nada"), estiloDaCapa(CAPA_PADRAO));
  });
});
