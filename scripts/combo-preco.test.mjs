// Testes do preço de combo em etapas (src/lib/combo-preco.ts).
// Rode: node --test scripts/combo-preco.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { precoComEtapas, problemaDasEscolhas, menorPreco } from "../src/lib/combo-preco.ts";

const PIZZA = { id: "g", nome: "Sabores da grande", min: 1, max: 3, permite_repetir: true, media: true };
const MINI = { id: "m", nome: "Sabor da mini", min: 1, max: 1, permite_repetir: false, media: true };
const REFRI = { id: "r", nome: "Refrigerante", min: 1, max: 1, permite_repetir: false };

test("pizza do combo cobra a média dos sabores; as etapas somam", () => {
  // Calabresa 92 + Brasa 100 + Kerb 96 → 96; mini 12; guaraná 0
  assert.equal(precoComEtapas(0, [PIZZA, MINI, REFRI], { g: [92, 100, 96], m: [12], r: [0] }), 108);
  // sabor repetido pesa dobrado: 2/3 calabresa + 1/3 brasa
  assert.equal(precoComEtapas(0, [PIZZA], { g: [92, 92, 100] }), 94.67);
});

test("etapa comum soma, com repetição (5 minis por 60)", () => {
  const CINCO = { id: "c", min: 5, max: 5, permite_repetir: true };
  assert.equal(precoComEtapas(0, [CINCO], { c: [12, 12, 12, 12, 12] }), 60);
  assert.equal(menorPreco(0, [CINCO], { c: [12, 14] }), 60);
});

test("marmita: preço do item + extras (como antes)", () => {
  const SOBREMESA = { id: "s", min: 0, max: 2, permite_repetir: false };
  assert.equal(precoComEtapas(27, [SOBREMESA], { s: [4, 4] }), 35);
  assert.equal(menorPreco(27, [SOBREMESA], { s: [4] }), 27);
});

test("valor mínimo do combo = mais barato de cada etapa obrigatória", () => {
  assert.equal(menorPreco(0, [PIZZA, MINI, REFRI], { g: [100, 92], m: [12, 14], r: [0] }), 104);
});

test("confere mínimo, máximo e repetição", () => {
  assert.match(problemaDasEscolhas([PIZZA], { g: [] }), /Escolha 1/);
  assert.match(problemaDasEscolhas([PIZZA], { g: ["a", "b", "c", "d"] }), /No máximo 3/);
  assert.match(problemaDasEscolhas([REFRI, { ...MINI, max: 2 }], { r: ["x"], m: ["a", "a"] }), /Não repete/);
  assert.equal(problemaDasEscolhas([PIZZA, REFRI], { g: ["a", "a"], r: ["x"] }), null);
});
