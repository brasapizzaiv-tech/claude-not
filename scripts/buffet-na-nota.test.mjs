// Testes do buffet na NFC-e (FIS-06, src/lib/fiscal/recebimento-nota.ts).
// A SEFAZ confere quantidade × valor unitário = valor do item (até 1 centavo).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buffetNaNota } from "../src/lib/fiscal/recebimento-nota.ts";

const fecha = (l) => Math.abs(l.qtd * l.preco_unit - l.bruto) <= 0.01;

test("por quilo: sai o peso real em KG", () => {
  const l = buffetNaNota(1, 31.59, 0.452, false);
  assert.equal(l.unidade, "KG");
  assert.equal(l.qtd, 0.452);
  assert.equal(l.bruto, 31.59);
  assert.ok(fecha(l));
});

test("por quilo pago em parte: a fração do peso", () => {
  const l = buffetNaNota(0.5, 15.8, 0.452, false);
  assert.equal(l.unidade, "KG");
  assert.equal(l.qtd, 0.226);
  assert.ok(fecha(l));
});

test("livre ou sem peso: 1 UN", () => {
  assert.deepEqual(buffetNaNota(1, 59.9, 0.8, true), { unidade: "UN", qtd: 1, preco_unit: 59.9, bruto: 59.9 });
  const sem = buffetNaNota(1, 59.9, 0, false);
  assert.equal(sem.unidade, "UN");
  const meia = buffetNaNota(0.5, 29.95, 0, true);
  assert.equal(meia.qtd, 0.5);
  assert.ok(fecha(meia));
});

test("muitos pesos fecham o valor", () => {
  for (let g = 100; g <= 2000; g += 37) {
    const kg = g / 1000;
    const bruto = Math.round(kg * 69.9 * 100) / 100;
    assert.ok(fecha(buffetNaNota(1, bruto, kg, false)), `${kg} kg`);
  }
});
