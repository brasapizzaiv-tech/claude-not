// Formas de pagamento da NFC-e (src/lib/fiscal/pagamentos-nota.ts), COD-002.
// Rode: node --test scripts/pagamentos-nota.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { bandeiraSefaz, pagamentosDaNota } from "../src/lib/fiscal/pagamentos-nota.ts";

const soma = (l) => Math.round(l.reduce((s, x) => s + Number(x.valor_pagamento), 0) * 100) / 100;

test("cartão de crédito com os 10%: a nota vai como crédito, no valor da nota", () => {
  const l = pagamentosDaNota([{ codigo: "03", valor: 110, bandeira: "VISA", autorizacao: "123456" }], 100);
  assert.deepEqual(l, [{ forma_pagamento: "03", valor_pagamento: "100.00", tipo_integracao: "2", bandeira_operadora: "01", numero_autorizacao: "123456" }]);
});

test("duas formas: proporcional e a soma bate no centavo", () => {
  const l = pagamentosDaNota([{ codigo: "03", valor: 70 }, { codigo: "01", valor: 40 }], 100);
  assert.equal(soma(l), 100);
  assert.deepEqual(l.map((x) => [x.forma_pagamento, x.valor_pagamento]), [["03", "63.64"], ["01", "36.36"]]);
  assert.equal(l[1].tipo_integracao, undefined); // dinheiro não leva grupo do cartão
});

test("mesma forma duas vezes vira uma linha; bandeiras diferentes vão sem bandeira", () => {
  const l = pagamentosDaNota([{ codigo: "04", valor: 30, bandeira: "VISA" }, { codigo: "04", valor: 20, bandeira: "ELO" }], 50);
  assert.equal(l.length, 1);
  assert.equal(l[0].valor_pagamento, "50.00");
  assert.equal(l[0].bandeira_operadora, undefined);
  assert.equal(l[0].numero_autorizacao, undefined);
});

test("estorno abate a forma; forma zerada sai da nota", () => {
  const l = pagamentosDaNota([{ codigo: "03", valor: 50 }, { codigo: "03", valor: -50 }, { codigo: "17", valor: 50 }], 45);
  assert.deepEqual(l.map((x) => [x.forma_pagamento, x.valor_pagamento]), [["17", "45.00"]]);
});

test("pago menos que a nota (desconto já fora): sobe na proporção até o total", () => {
  const l = pagamentosDaNota([{ codigo: "01", valor: 10 }, { codigo: "11", valor: 10 }], 25);
  assert.equal(soma(l), 25);
});

test("sem pagamento com valor: lista vazia (quem chama usa a forma antiga)", () => {
  assert.deepEqual(pagamentosDaNota([], 50), []);
  assert.deepEqual(pagamentosDaNota([{ codigo: "03", valor: 0 }], 50), []);
});

test("bandeiras do pinpad", () => {
  assert.equal(bandeiraSefaz("MASTERCARD"), "02");
  assert.equal(bandeiraSefaz("Master"), "02");
  assert.equal(bandeiraSefaz("VISA"), "01");
  assert.equal(bandeiraSefaz("ELO"), "06");
  assert.equal(bandeiraSefaz("AMEX"), "03");
  assert.equal(bandeiraSefaz("ALELO"), "10");
  assert.equal(bandeiraSefaz("SODEXO"), "23");
  assert.equal(bandeiraSefaz("VR"), "26");
  assert.equal(bandeiraSefaz("TICKET"), "27");
  assert.equal(bandeiraSefaz("LECARD VOUCHER"), undefined);
  assert.equal(bandeiraSefaz("BANRISUL"), undefined);
  assert.equal(bandeiraSefaz(""), undefined);
});
