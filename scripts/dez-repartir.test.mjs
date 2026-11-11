// Testes da divisão do 10% em centavos (EQP-04, src/lib/dez-repartir.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { repartirDez } from "../src/lib/dez-repartir.ts";

const soma = (m) => Math.round([...m.values()].reduce((s, v) => s + v, 0) * 100) / 100;

test("a soma bate com o que tem pra dividir", () => {
  const p = [{ id: "a", peso: 1 }, { id: "b", peso: 1 }, { id: "c", peso: 1 }];
  const m = repartirDez(100, p);
  assert.equal(soma(m), 100);
  assert.deepEqual([...m.values()].sort(), [33.33, 33.33, 33.34]);
});

test("peso diferente", () => {
  const m = repartirDez(250.55, [{ id: "a", peso: 1 }, { id: "b", peso: 0.5 }, { id: "c", peso: 1.5 }, { id: "d", peso: 1 }]);
  assert.equal(soma(m), 250.55);
  assert.ok(Math.abs(m.get("c") - 250.55 * 1.5 / 4) < 0.011);
});

test("sem ninguém ou sem valor", () => {
  assert.equal(repartirDez(100, []).size, 0);
  assert.equal(repartirDez(0, [{ id: "a", peso: 1 }]).size, 0);
});
