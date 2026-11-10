// Testes da nota por recebimento (src/lib/fiscal/recebimento-nota.ts).
// Rode: node --test scripts/recebimento-nota.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { linhasDaNota, unidadeDaLinha } from "../src/lib/fiscal/recebimento-nota.ts";

const A = "00000000-0000-4000-8000-00000000000a";

test("o caso do Rafael: 1 almoço + meia Coca (Coca dividida em 2 linhas)", () => {
  const l = linhasDaNota([
    { tipo: "item", comanda_id: A, linha_id: "l1", item_id: "alm", descricao: "Almoço executivo", qtd: 1, preco_unit: 39.9, valor: 39.9 },
    { tipo: "item", comanda_id: A, linha_id: "l2", item_id: "coca", descricao: "Coca 2L (1/2)", qtd: 0.5, preco_unit: 16, valor: 8 },
  ], false);
  assert.deepEqual(l.map((x) => [x.descricao, x.qtd, x.bruto]), [["Almoço executivo", 1, 39.9], ["Coca 2L (1/2)", 0.5, 8]]);
  assert.equal(unidadeDaLinha(l[1], false, "UN"), "UN"); // meia Coca não vira KG
});

test("Pagar parte (1 de 3): fração de cada linha, valor = qtd × preço", () => {
  const l = linhasDaNota([
    { tipo: "buffet", comanda_id: A, numero: 12, preco: 60, valor: 20 },
    { tipo: "item", comanda_id: A, linha_id: "l1", item_id: "coca", descricao: "Coca lata", qtd: 3, preco_unit: 7, valor: 7 },
  ], false);
  assert.equal(l[0].descricao, "Buffet");
  assert.equal(l[0].qtd, 0.3333);
  assert.equal(l[0].bruto, 20); // 0,3333 × 60 = 19,998 → 20,00
  assert.equal(l[1].qtd, 1);
  assert.equal(l[1].bruto, 7);
  for (const x of l) assert.ok(Math.abs(x.bruto - x.qtd * x.preco_unit) <= 0.005);
});

test("pagou a linha inteira: quantidade da comanda (peso do buffet a kg preservado)", () => {
  const l = linhasDaNota([{ tipo: "item", comanda_id: A, linha_id: "l1", item_id: "kg", descricao: "Buffet a kg", qtd: 0.452, preco_unit: 99.9, valor: 45.15 }], false);
  assert.equal(l[0].qtd, 0.452);
  assert.equal(unidadeDaLinha(l[0], true, "UN"), "KG");
});

test("buffet pago inteiro sai com quantidade 1 e, em comandas juntas, com o número", () => {
  const l = linhasDaNota([{ tipo: "buffet", comanda_id: A, numero: 7, preco: 46.9, valor: 46.9 }], true);
  assert.deepEqual([l[0].descricao, l[0].qtd, l[0].bruto], ["Buffet (comanda 7)", 1, 46.9]);
});

test("linha sem valor coberto ou sem preço não entra", () => {
  const l = linhasDaNota([
    { tipo: "item", comanda_id: A, linha_id: "l1", item_id: null, descricao: "Brinde", qtd: 1, preco_unit: 0, valor: 0 },
    { tipo: "buffet", comanda_id: A, numero: 1, preco: 0, valor: 0 },
  ], false);
  assert.equal(l.length, 0);
});
