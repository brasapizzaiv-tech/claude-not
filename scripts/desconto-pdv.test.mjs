// Desconto do PDV (src/lib/desconto-pdv.ts).
// Rode: node --test scripts/desconto-pdv.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { descontoFuncionario, descontoValido, percentualFuncionario, valorDoDesconto } from "../src/lib/desconto-pdv.ts";

test("funcionário: dinheiro e Compra da equipe 30%, cartão e Pix 20%, o resto nada", () => {
  assert.equal(percentualFuncionario("dinheiro"), 30);
  assert.equal(percentualFuncionario("equipe"), 30);
  for (const t of ["pix", "pix_maquina", "credito", "debito", "cartao"]) assert.equal(percentualFuncionario(t), 20);
  for (const t of ["saldo", "vale", "cortesia", "vale_presente", "outro"]) assert.equal(percentualFuncionario(t), 0);
});

test("funcionário: o desconto sai do preço de um item, muda com a forma", () => {
  assert.equal(descontoFuncionario(60, "dinheiro"), 18);
  assert.equal(descontoFuncionario(60, "pix"), 12);
  assert.equal(descontoFuncionario(46.9, "dinheiro"), 14.07);
  assert.equal(descontoFuncionario(60, "equipe"), 18);
  assert.equal(descontoFuncionario(60, "saldo"), 0);
});

test("desconto em reais", () => {
  assert.equal(valorDoDesconto(50, "7,50", false), 7.5);
  assert.equal(valorDoDesconto(50, "10", false), 10);
  assert.equal(valorDoDesconto(5000, "1.000,00", false), 1000);
});

test("desconto em percentual, arredondado no centavo", () => {
  assert.equal(valorDoDesconto(46.9, "30", true), 14.07);
  assert.equal(valorDoDesconto(33.33, "10", true), 3.33);
});

test("vazio, texto ou negativo não dão desconto", () => {
  assert.equal(valorDoDesconto(50, "", false), 0);
  assert.equal(valorDoDesconto(50, "abc", true), 0);
  assert.equal(valorDoDesconto(50, "-5", false), 0);
});

test("desconto tem que ficar abaixo do total", () => {
  assert.equal(descontoValido(50, 0), true);
  assert.equal(descontoValido(50, 49.99), true);
  assert.equal(descontoValido(50, 50), false);
  assert.equal(descontoValido(50, 60), false);
  assert.equal(descontoValido(50, -1), false);
  assert.equal(descontoValido(50, NaN), false);
});
