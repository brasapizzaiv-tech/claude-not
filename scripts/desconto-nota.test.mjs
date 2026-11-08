// Desconto na nota fiscal (src/lib/fiscal/desconto-nota.ts).
// Rode: node --test scripts/desconto-nota.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { repartirDesconto, totalComDesconto } from "../src/lib/fiscal/desconto-nota.ts";

const soma = (a) => Math.round(a.reduce((x, y) => x + y, 0) * 100) / 100;

test("item único leva o desconto inteiro", () => {
  assert.deepEqual(repartirDesconto([42], 12.6), [12.6]);
  assert.equal(totalComDesconto(42, 12.6), 29.4);
});

test("vários itens: proporcional e a soma bate no centavo", () => {
  const p = repartirDesconto([60, 60, 60, 8], 18);
  assert.equal(soma(p), 18);
  assert.deepEqual(p, [5.75, 5.74, 5.74, 0.77]);
  const q = repartirDesconto([10, 10, 10], 1);
  assert.equal(soma(q), 1);
  assert.deepEqual(q, [0.34, 0.33, 0.33]);
});

test("nenhum item passa do próprio valor", () => {
  const p = repartirDesconto([0.01, 100], 50);
  assert.equal(soma(p), 50);
  assert.ok(p[0] <= 0.01 && p[1] <= 100);
});

test("sem desconto, desconto negativo ou itens zerados não descontam nada", () => {
  assert.deepEqual(repartirDesconto([10, 20], 0), [0, 0]);
  assert.deepEqual(repartirDesconto([10, 20], -5), [0, 0]);
  assert.deepEqual(repartirDesconto([0, 0], 5), [0, 0]);
});

test("desconto maior que o total para no total", () => {
  assert.deepEqual(repartirDesconto([10, 5], 99), [10, 5]);
  assert.equal(totalComDesconto(15, 99), 0);
});

test("total com desconto sem erro de centavo", () => {
  assert.equal(totalComDesconto(188, 18), 170);
  assert.equal(totalComDesconto(0.3, 0.1), 0.2);
});
