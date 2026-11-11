// Testes do débito com bandeira de vale (PAG-06, src/lib/formas-pagamento.ts).
// Rode: node --test scripts/forma-pela-bandeira.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { ehBandeiraDeVale, formaPelaBandeira } from "../src/lib/formas-pagamento.ts";

const formas = [
  { nome: "Dinheiro", tipo: "dinheiro" },
  { nome: "Cartão de débito", tipo: "debito" },
  { nome: "Cartão de crédito", tipo: "credito" },
  { nome: "Vale refeição", tipo: "vale" },
];

test("bandeiras de vale vistas no caixa", () => {
  for (const b of ["LECARD VOUCHER", "VR", "ALELO", "SODEXO", "TICKET", "Pluxee"]) assert.equal(ehBandeiraDeVale(b), true, b);
  for (const b of ["MASTERCARD", "VISA", "ELO", "BANRISUL", "CABAL", "OUTRA", "AMEX", "", null]) assert.equal(ehBandeiraDeVale(b), false, String(b));
});

test("débito com bandeira de vale vai pra forma de vale", () => {
  assert.equal(formaPelaBandeira("Cartão de débito", { tipo: "debito", bandeira: "LECARD VOUCHER" }, formas), "Vale refeição");
});

test("o resto fica como está", () => {
  assert.equal(formaPelaBandeira("Cartão de débito", { tipo: "debito", bandeira: "MASTERCARD" }, formas), "Cartão de débito");
  assert.equal(formaPelaBandeira("Cartão de crédito", { tipo: "credito", bandeira: "ALELO" }, formas), "Cartão de crédito");
  assert.equal(formaPelaBandeira("Cartão de débito", null, formas), "Cartão de débito");
  // sem forma de vale no cadastro: não inventa
  assert.equal(formaPelaBandeira("Cartão de débito", { tipo: "debito", bandeira: "VR" }, formas.filter((f) => f.tipo !== "vale")), "Cartão de débito");
});
