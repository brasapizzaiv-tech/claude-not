// Testes das contas do cofre (src/lib/cofre.ts).
// Rode: node --test scripts/cofre.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { valorDe, valorGaveta, limpar, situacao, listaEncomenda, rotuloDen, negar, qtdDoValor, contagemValida, contagemDoCaixa } from "../src/lib/cofre.ts";

test("valor digitado vira quantidade de notas", () => {
  assert.equal(qtdDoValor(5000, "600"), 12);
  assert.equal(qtdDoValor(5000, "600,00"), 12);
  assert.equal(qtdDoValor(10000, "1.200,00"), 12);
  assert.equal(qtdDoValor(50, "3,50"), 7);
  assert.equal(qtdDoValor(50, "0.50"), 1);
  assert.equal(qtdDoValor(5, "1,05"), 21);
  assert.equal(qtdDoValor(5000, ""), 0);
});

test("valor que não fecha em notas inteiras é recusado", () => {
  assert.equal(qtdDoValor(5000, "75"), null);
  assert.equal(qtdDoValor(200, "3"), null);
  assert.equal(qtdDoValor(5000, "abc"), null);
  assert.equal(qtdDoValor(5000, "-50"), null);
});

test("contagem do fechamento não aceita quantidade negativa", () => {
  assert.deepEqual(contagemValida({ 5000: 2, 7: 3, 100: 0 }), { 5000: 2 });
  assert.equal(contagemValida({ 5000: -2 }), null);
});

test("cofre só reaproveita a contagem que bate com o valor do caixa", () => {
  const notas = { 5000: 2, 1000: 1 };
  assert.deepEqual(contagemDoCaixa({ notas }, 110), notas);
  assert.equal(contagemDoCaixa({ notas }, 120), null);
  assert.equal(contagemDoCaixa({}, 110), null);
  assert.equal(contagemDoCaixa(null, 110), null);
  assert.equal(contagemDoCaixa({ notas: { 5000: -2 } }, -100), null);
});

test("valor em centavos não erra soma de moeda", () => {
  assert.equal(valorDe({ "5": 3, "10": 1, "25": 2 }), 0.75);
  assert.equal(valorDe({ "10000": 2, "200": -5 }), 190);
});

test("valor por gaveta", () => {
  const q = { "5": 20, "100": 3, "200": 10, "2000": 1, "5000": 2 };
  assert.equal(valorGaveta(q, "moedas"), 4);
  assert.equal(valorGaveta(q, "troco"), 40);
  assert.equal(valorGaveta(q, "grandes"), 100);
});

test("limpar tira zero, fração e nota que não existe", () => {
  assert.deepEqual(limpar({ "200": 3.7, "500": 0, "300": 4, "x": 1 }), { "200": 3 });
  assert.deepEqual(negar({ "200": 3 }), { "200": -3 });
});

test("situação: encomenda até o máximo, deposita a sobra, faixa zerada é livre", () => {
  assert.deepEqual(situacao(40, { minimo: 50, maximo: 150 }), { tipo: "encomendar", n: 110 });
  assert.deepEqual(situacao(35, { minimo: 0, maximo: 30 }), { tipo: "depositar", n: 5 });
  assert.deepEqual(situacao(60, { minimo: 50, maximo: 150 }), { tipo: "ok", n: 0 });
  assert.deepEqual(situacao(10, { minimo: 0, maximo: 0 }), { tipo: "livre", n: 0 });
  assert.deepEqual(situacao(10, { minimo: 20, maximo: 0 }), { tipo: "encomendar", n: 10 });
});

test("lista de encomenda só com o que está abaixo do mínimo", () => {
  const faixas = { "200": { minimo: 50, maximo: 150 }, "10000": { minimo: 0, maximo: 30 } };
  assert.deepEqual(listaEncomenda({ "200": 40, "10000": 35 }, faixas), { "200": 110 });
});

test("nota de R$ 200 existe e é nota grande", () => {
  assert.deepEqual(limpar({ "20000": 3 }), { "20000": 3 });
  assert.equal(qtdDoValor(20000, "1.000,00"), 5);
  assert.equal(valorGaveta({ "20000": 2, "10000": 1 }, "grandes"), 500);
  assert.equal(rotuloDen(20000), "R$ 200");
});

test("rótulos", () => {
  assert.equal(rotuloDen(10000), "R$ 100");
  assert.equal(rotuloDen(100), "R$ 1");
  assert.equal(rotuloDen(25), "R$ 0,25");
  assert.equal(rotuloDen(5), "R$ 0,05");
});
