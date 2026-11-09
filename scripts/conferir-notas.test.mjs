// O que gravar a partir da consulta da Focus (src/lib/fiscal/conferir-notas.ts, NFE-01/NFE-07).
// Rode: node --test scripts/conferir-notas.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { interpretarConsulta } from "../src/lib/fiscal/interpretar-consulta.ts";

const CONT = "Autorizado o uso da NF-e (contingência offline)";

test("contingência confirmada pela SEFAZ: continua autorizada e o texto diz que confirmou", () => {
  const r = interpretarConsulta({ status: "autorizado", mensagem: CONT }, { status: "autorizado", bruto: { contingencia_offline: true, contingencia_offline_efetivada: true } });
  assert.equal(r.status, "autorizado");
  assert.match(r.mensagem, /confirmada pela SEFAZ/);
});

test("contingência ainda não confirmada: autorizada, com aviso", () => {
  const r = interpretarConsulta({ status: "autorizado", mensagem: CONT }, { status: "autorizado", bruto: { contingencia_offline: true, contingencia_offline_efetivada: false } });
  assert.equal(r.status, "autorizado");
  assert.match(r.mensagem, /ainda não confirmou/);
});

test("Focus não diz nada da contingência: nada muda (não inventa)", () => {
  const r = interpretarConsulta({ status: "autorizado", mensagem: CONT }, { status: "autorizado", bruto: {} });
  assert.deepEqual(r, { status: "autorizado", mensagem: CONT });
});

test("SEFAZ recusou depois da contingência: muda o status e marca bem claro", () => {
  const r = interpretarConsulta({ status: "autorizado", mensagem: CONT }, { status: "erro_autorizacao", mensagem: "Rejeição: duplicidade" });
  assert.equal(r.status, "erro_autorizacao");
  assert.match(r.mensagem, /^RECUSADA DEPOIS DA CONTINGÊNCIA: Rejeição/);
});

test("nota normal autorizada continua igual", () => {
  const r = interpretarConsulta({ status: "autorizado", mensagem: "Autorizado o uso da NF-e" }, { status: "autorizado", mensagem: "Autorizado o uso da NF-e", bruto: {} });
  assert.deepEqual(r, { status: "autorizado", mensagem: "Autorizado o uso da NF-e" });
});

test("processando que autorizou vira autorizada", () => {
  const r = interpretarConsulta({ status: "processando_autorizacao", mensagem: null }, { status: "autorizado", mensagem: "Autorizado o uso da NF-e" });
  assert.equal(r.status, "autorizado");
});

test("cancelando confirmado: fecha como cancelada se não tem baixa no saldo/caixa", () => {
  const r = interpretarConsulta({ status: "cancelando", mensagem: "x", fiado_id: null, mov_id: null }, { status: "cancelado" });
  assert.equal(r.status, "cancelado");
});

test("cancelando confirmado COM baixa no saldo: continua cancelando e pede o clique (desfazer a baixa)", () => {
  const r = interpretarConsulta({ status: "cancelando", mensagem: "x", fiado_id: "f1", mov_id: null }, { status: "cancelado" });
  assert.equal(r.status, "cancelando");
  assert.match(r.mensagem, /desfazer a baixa/);
});

test("Focus sem status: mantém o que tinha", () => {
  const r = interpretarConsulta({ status: "processando_autorizacao", mensagem: "m" }, {});
  assert.deepEqual(r, { status: "processando_autorizacao", mensagem: "m" });
});
