// Testes das regras do ponto (src/lib/ponto-core.ts).
// Rode: node --test scripts/ponto.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { lerAfd, turnoDaBatida, acharPorNome } from "../src/lib/ponto-core.ts";

// Linhas no layout da Portaria 671: tipo 7 (REP-P) e tipo 3 (REP-C).
const t7 = (nsr, dh, cpf) => String(nsr).padStart(9, "0") + "7" + dh + cpf.padStart(12, "0") + dh + "01" + "1" + "a".repeat(64);
const t3 = (nsr, dh, cpf) => String(nsr).padStart(9, "0") + "3" + dh + cpf.padStart(12, "0") + "ABCD";

test("lê tipo 7 e tipo 3, ignora cabeçalho e lixo", () => {
  const afd = [
    "0000000001" + "1".repeat(200), // cabeçalho (tipo 1)
    t7(2, "2026-10-12T10:58:00-0300", "12345678901"),
    t3(3, "2026-10-12T15:02:00-0300", "98765432100"),
    "linha curta",
    "",
  ].join("\r\n");
  const r = lerAfd(afd);
  assert.equal(r.length, 2);
  assert.deepEqual(r[0], { nsr: 2, dataHora: "2026-10-12T10:58:00-03:00", cpf: "12345678901" });
  assert.equal(r[1].cpf, "98765432100");
  assert.ok(!Number.isNaN(Date.parse(r[0].dataHora)));
});

test("turno pela hora local", () => {
  assert.deepEqual(turnoDaBatida("2026-10-12T10:58:00-03:00"), { data: "2026-10-12", turno: "dia" });
  assert.deepEqual(turnoDaBatida("2026-10-12T15:59:00-03:00"), { data: "2026-10-12", turno: "dia" });
  assert.deepEqual(turnoDaBatida("2026-10-12T16:00:00-03:00"), { data: "2026-10-12", turno: "noite" });
  assert.deepEqual(turnoDaBatida("2026-10-12T23:40:00-03:00"), { data: "2026-10-12", turno: "noite" });
});

test("saída depois da meia-noite é a noite do dia anterior", () => {
  assert.deepEqual(turnoDaBatida("2026-10-13T00:35:00-03:00"), { data: "2026-10-12", turno: "noite" });
  assert.deepEqual(turnoDaBatida("2026-11-01T01:10:00-03:00"), { data: "2026-10-31", turno: "noite" });
});

test("liga pelo nome só quando é uma pessoa", () => {
  const c = [{ nome: "Ana Paula" }, { nome: "Eric" }, { nome: "Luana D." }, { nome: "Luana M." }];
  assert.equal(acharPorNome("ANA PAULA SOUZA", c)?.nome, "Ana Paula");
  assert.equal(acharPorNome("Éric", c)?.nome, "Eric");
  assert.equal(acharPorNome("Luana", c), null); // duas Luanas: não arrisca
  assert.equal(acharPorNome("Fulano", c), null);
});
