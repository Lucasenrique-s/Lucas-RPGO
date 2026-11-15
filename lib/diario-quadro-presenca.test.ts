import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { corDaPessoa, iniciais, limitarTaxa } from "./diario-quadro-presenca.ts";

describe("corDaPessoa", () => {
  it("é sempre a mesma pra mesma pessoa e nunca cinza", () => {
    assert.equal(corDaPessoa("abc"), corDaPessoa("abc"));
    for (const id of ["a", "b", "c", "1ae6c5c3-bd4f-42c6-be05-045684bd2f32", "zzz"]) assert.notEqual(corDaPessoa(id), "cinza");
  });
  it("espalha as pessoas por mais de uma cor", () => {
    const cores = new Set(Array.from({ length: 40 }, (_, i) => corDaPessoa(`pessoa-${i}`)));
    assert.equal(cores.size > 3, true);
  });
});

describe("iniciais", () => {
  it("usa a primeira e a última palavra", () => {
    assert.equal(iniciais("Zoro Teste"), "ZT");
    assert.equal(iniciais("Monkey D. Luffy"), "ML");
  });
  it("uma palavra só dá duas letras; vazio dá ?", () => {
    assert.equal(iniciais("Narrador"), "NA");
    assert.equal(iniciais("   "), "?");
  });
});

describe("limitarTaxa", () => {
  it("manda o primeiro na hora e o último ao fim da janela, juntando os do meio", async () => {
    const recebidos: number[] = [];
    const f = limitarTaxa((n: number) => recebidos.push(n), 40);
    f(1);
    f(2);
    f(3);
    assert.deepEqual(recebidos, [1]);
    await new Promise((r) => setTimeout(r, 90));
    assert.deepEqual(recebidos, [1, 3]);
  });
  it("cancelar descarta o que esperava", async () => {
    const recebidos: number[] = [];
    const f = limitarTaxa((n: number) => recebidos.push(n), 30);
    f(1);
    f(2);
    f.cancelar();
    await new Promise((r) => setTimeout(r, 70));
    assert.deepEqual(recebidos, [1]);
  });
});
