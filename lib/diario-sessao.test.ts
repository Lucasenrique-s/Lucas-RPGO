import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { instanteDaSessaoAnterior, numeroSugerido } from "./diario-sessao.ts";

const dia = (d: number) => new Date(Date.UTC(2026, 10, d));
const ms = (d: Date) => d.getTime();

describe("instanteDaSessaoAnterior", () => {
  it("fica antes da primeira sessão numerada quando só há números maiores", () => {
    const t = instanteDaSessaoAnterior(11, [{ numero: 12, iniciadaEm: dia(10) }]);
    assert.ok(ms(t) < ms(dia(10)));
  });

  it("registrar fora de ordem mantém a ordem pelo número", () => {
    const existentes = [{ numero: 12, iniciadaEm: dia(10) }];
    const s5 = instanteDaSessaoAnterior(5, existentes);
    const s3 = instanteDaSessaoAnterior(3, [...existentes, { numero: 5, iniciadaEm: s5 }]);
    const s4 = instanteDaSessaoAnterior(4, [...existentes, { numero: 5, iniciadaEm: s5 }, { numero: 3, iniciadaEm: s3 }]);
    const s8 = instanteDaSessaoAnterior(8, [...existentes, { numero: 5, iniciadaEm: s5 }]);
    assert.ok(ms(s3) < ms(s4) && ms(s4) < ms(s5) && ms(s5) < ms(s8) && ms(s8) < ms(dia(10)));
  });

  it("entre duas vizinhas fica no meio", () => {
    const t = instanteDaSessaoAnterior(2, [
      { numero: 1, iniciadaEm: dia(1) },
      { numero: 3, iniciadaEm: dia(3) },
    ]);
    assert.equal(ms(t), ms(dia(2)));
  });

  it("vizinhas fora de ordem não derrubam: fica logo depois da menor", () => {
    const t = instanteDaSessaoAnterior(2, [
      { numero: 1, iniciadaEm: dia(5) },
      { numero: 3, iniciadaEm: dia(3) },
    ]);
    assert.ok(ms(t) > ms(dia(5)));
  });

  it("sem sessão numerada, vai antes de tudo; sem nenhuma, antes de agora", () => {
    const sem = instanteDaSessaoAnterior(1, [{ numero: null, iniciadaEm: dia(4) }]);
    assert.ok(ms(sem) < ms(dia(4)));
    const agora = dia(20);
    assert.ok(ms(instanteDaSessaoAnterior(1, [], agora)) < ms(agora));
  });
});

describe("numeroSugerido", () => {
  it("sugere o que falta logo abaixo da menor sessão", () => {
    assert.equal(numeroSugerido([12, 13]), 11);
    assert.equal(numeroSugerido([12, 11, 5]), 4);
  });

  it("não sugere nada quando não há o que sugerir", () => {
    assert.equal(numeroSugerido([]), null);
    assert.equal(numeroSugerido([null]), null);
    assert.equal(numeroSugerido([1, 2]), null);
  });
});
