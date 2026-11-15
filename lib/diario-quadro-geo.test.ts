import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { acharLugarLivre, ajustarImagem, centroDe, deslocamentoParaColar, dentroDaMoldura, extrairUrl, limitarGeometria, pareceImagem, pontoNaBorda } from "./diario-quadro-geo.ts";

const caixa = { x: 0, y: 0, largura: 200, altura: 100 };

describe("pontoNaBorda", () => {
  it("sai pela direita quando o alvo está à direita", () => {
    assert.deepEqual(pontoNaBorda(caixa, { x: 1000, y: 50 }), { x: 200, y: 50 });
  });
  it("sai por cima quando o alvo está acima", () => {
    assert.deepEqual(pontoNaBorda(caixa, { x: 100, y: -500 }), { x: 100, y: 0 });
  });
  it("na diagonal bate no canto certo", () => {
    assert.deepEqual(pontoNaBorda(caixa, { x: 300, y: 150 }), { x: 200, y: 100 });
  });
  it("alvo no próprio centro devolve o centro", () => {
    assert.deepEqual(pontoNaBorda(caixa, centroDe(caixa)), { x: 100, y: 50 });
  });
});

describe("dentroDaMoldura", () => {
  const moldura = { x: 0, y: 0, largura: 400, altura: 300 };
  it("conta pelo centro do cartão", () => {
    assert.equal(dentroDaMoldura(moldura, { x: 100, y: 100, largura: 100, altura: 100 }), true);
    assert.equal(dentroDaMoldura(moldura, { x: 380, y: 100, largura: 100, altura: 100 }), false);
    assert.equal(dentroDaMoldura(moldura, { x: 350, y: 100, largura: 100, altura: 100 }), true);
  });
});

describe("limitarGeometria", () => {
  it("corta números absurdos e NaN", () => {
    const g = limitarGeometria({ x: 1e12, y: -1e12, largura: 1, altura: NaN });
    assert.equal(g.x, 1_000_000);
    assert.equal(g.y, -1_000_000);
    assert.equal(g.largura, 40);
    assert.equal(g.altura, 24);
  });
  it("só mexe no que veio", () => {
    assert.deepEqual(limitarGeometria({ x: 5 }), { x: 5 });
  });
});

describe("entrada colada", () => {
  it("extrai só endereço de uma linha", () => {
    assert.equal(extrairUrl("  https://exemplo.com/a.png "), "https://exemplo.com/a.png");
    assert.equal(extrairUrl("olha https://exemplo.com"), null);
    assert.equal(extrairUrl("javascript:alert(1)"), null);
    assert.equal(extrairUrl("ftp://x.com/a"), null);
  });
  it("reconhece endereço de imagem", () => {
    assert.equal(pareceImagem("https://x.com/a/b.JPG?v=1"), true);
    assert.equal(pareceImagem("https://x.com/pagina"), false);
  });
  it("ajusta a imagem mantendo a proporção", () => {
    assert.deepEqual(ajustarImagem(720, 360), { largura: 360, altura: 180 });
    assert.deepEqual(ajustarImagem(100, 50), { largura: 100, altura: 50 });
    assert.deepEqual(ajustarImagem(0, 0), { largura: 360, altura: 270 });
  });
});

describe("acharLugarLivre", () => {
  const r = { x: 0, y: 0, largura: 100, altura: 100 };
  it("fica onde está se não há nada", () => {
    assert.deepEqual(acharLugarLivre(r, []), r);
  });
  it("sai de cima de um cartão ocupado", () => {
    const t = acharLugarLivre(r, [{ x: 0, y: 0, largura: 100, altura: 100 }]);
    assert.notDeepEqual(t, r);
    assert.equal(Math.max(Math.abs(t.x), Math.abs(t.y)) >= 124, true);
  });
  it("ocupando o primeiro anel inteiro, vai pro segundo", () => {
    const ocupados = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) ocupados.push({ x: dx * 124, y: dy * 124, largura: 100, altura: 100 });
    const t = acharLugarLivre(r, ocupados);
    assert.equal(Math.max(Math.abs(t.x), Math.abs(t.y)), 248);
  });
});

describe("deslocamentoParaColar", () => {
  it("destino vazio: não desloca", () => {
    assert.deepEqual(deslocamentoParaColar([{ x: 10, y: 20, largura: 50, altura: 50 }], []), { x: 0, y: 0 });
  });
  it("põe o grupo à direita do que existe, com o topo alinhado e a forma preservada", () => {
    const origem = [
      { x: 100, y: 200, largura: 80, altura: 40 },
      { x: 300, y: 260, largura: 80, altura: 40 },
    ];
    const destino = [
      { x: 0, y: 50, largura: 200, altura: 100 },
      { x: 500, y: -30, largura: 100, altura: 100 },
    ];
    const d = deslocamentoParaColar(origem, destino, 100);
    // direita do destino = 600; origem começa em x=100 → dx = 600 + 100 - 100
    assert.deepEqual(d, { x: 600, y: -30 - 200 });
    const novos = origem.map((r) => ({ ...r, x: r.x + d.x, y: r.y + d.y }));
    assert.equal(novos[1].x - novos[0].x, 200);
    assert.equal(novos[1].y - novos[0].y, 60);
  });
});
