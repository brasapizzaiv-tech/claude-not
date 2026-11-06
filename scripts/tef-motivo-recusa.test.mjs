// Motivo da recusa do pinpad (motivoRecusa, em src/lib/tef-client.ts).
// Rode: node --test scripts/tef-motivo-recusa.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { motivoRecusa } from "../src/lib/tef-client.ts";

test('"Sucesso" do Hub nunca vira motivo', () => {
  const r = motivoRecusa({ mensagem: "Sucesso", status: "", codigo: "0", retorno: "1", campos: {} });
  assert.equal(r.tela, "recusado ou cancelado no pinpad");
  assert.equal(r.registro, "O pinpad não informou o motivo [código 0, retorno 1]");
});

test("usa o texto do operador quando a mensagem é genérica", () => {
  const r = motivoRecusa({ mensagem: "Sucesso", campos: { "030-000": "MODO INVALIDO, USE CHIP" } });
  assert.equal(r.tela, "MODO INVALIDO, USE CHIP");
});

test("mensagem de verdade continua valendo", () => {
  const r = motivoRecusa({ mensagem: "SALDO INSUFICIENTE", status: "NEGADA", codigo: "51", campos: { "030-000": "outro" } });
  assert.equal(r.tela, "SALDO INSUFICIENTE");
  assert.equal(r.registro, "SALDO INSUFICIENTE [status NEGADA, código 51]");
});

test("sem nada, ainda explica", () => {
  const r = motivoRecusa({});
  assert.equal(r.tela, "recusado ou cancelado no pinpad");
  assert.equal(r.registro, "O pinpad não informou o motivo");
});
