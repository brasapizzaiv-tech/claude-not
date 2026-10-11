// Testes do prêmio assiduidade (src/lib/assiduidade-core.ts).
// Rode: node --test scripts/assiduidade.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { apurarMes, periodoMes, diasEntre, trimestreDe, mesesDoTrimestre } from "../src/lib/assiduidade-core.ts";

const SEG_SAB = [1, 2, 3, 4, 5, 6];
const ENT = { 1: "08:00", 2: "08:00", 3: "08:00", 4: "08:00", 5: "08:00", 6: "08:00" };
// Semana de 12 (seg) a 17/10/2026 (sáb); domingo 18 fora da escala.
const DIAS = diasEntre("2026-10-12", "2026-10-18");
const todasNoHorario = () => new Map(DIAS.slice(0, 6).map((d) => [d, "07:55"]));
const base = (o = {}) => ({ dias: DIAS, hoje: "2026-10-31", escala: SEG_SAB, entradas: ENT, primeiraBatida: todasNoHorario(), folgas: new Set(), atestados: new Set(), fechados: new Set(), tolerancia: 15, ...o });

test("tudo certo ganha", () => {
  const r = apurarMes(base());
  assert.equal(r.esperados, 6);
  assert.equal(r.ganhou, true);
  assert.equal(r.atrasoTotal, 0);
});

test("atraso soma no mês: 5 min em 3 dias ainda ganha, 16 perde", () => {
  const b = todasNoHorario();
  b.set("2026-10-12", "08:05"); b.set("2026-10-13", "08:05"); b.set("2026-10-14", "08:05");
  assert.equal(apurarMes(base({ primeiraBatida: b })).ganhou, true);
  b.set("2026-10-15", "08:01");
  const r = apurarMes(base({ primeiraBatida: b }));
  assert.equal(r.atrasoTotal, 16);
  assert.equal(r.ganhou, false);
});

test("falta perde; dia de hoje sem batida ainda não é falta", () => {
  const b = todasNoHorario(); b.delete("2026-10-14");
  const r = apurarMes(base({ primeiraBatida: b }));
  assert.deepEqual(r.faltas, ["2026-10-14"]);
  assert.equal(r.ganhou, false);
  assert.equal(apurarMes(base({ primeiraBatida: b, hoje: "2026-10-14" })).ganhou, true);
});

test("folga aprovada e atestado perdem, mas não são falta", () => {
  const b = todasNoHorario(); b.delete("2026-10-13");
  const f = apurarMes(base({ primeiraBatida: b, folgas: new Set(["2026-10-13"]) }));
  assert.deepEqual(f.faltas, []); assert.deepEqual(f.folgas, ["2026-10-13"]); assert.equal(f.ganhou, false);
  const a = apurarMes(base({ primeiraBatida: b, atestados: new Set(["2026-10-13"]) }));
  assert.deepEqual(a.faltas, []); assert.equal(a.atestados.length, 1); assert.equal(a.ganhou, false);
});

test("feriado fechado e dia fora da escala não contam", () => {
  const b = todasNoHorario(); b.delete("2026-10-12");
  assert.equal(apurarMes(base({ primeiraBatida: b, fechados: new Set(["2026-10-12"]) })).ganhou, true);
  assert.equal(apurarMes(base({ primeiraBatida: b, escala: [2, 3, 4, 5, 6] })).ganhou, true);
});

test("sem dia pra apurar = nulo", () => {
  assert.equal(apurarMes(base({ dias: [] })).ganhou, null);
});

test("período e trimestre", () => {
  assert.deepEqual(periodoMes("2026-10"), { de: "2026-10-01", ate: "2026-10-31" });
  assert.deepEqual(periodoMes("2026-10", 21), { de: "2026-09-21", ate: "2026-10-20" });
  assert.deepEqual(periodoMes("2027-01", 21), { de: "2026-12-21", ate: "2027-01-20" });
  assert.equal(trimestreDe("2026-10"), "2026-T4");
  assert.deepEqual(mesesDoTrimestre("2026-T4"), ["2026-10", "2026-11", "2026-12"]);
});

test("abono não é falta e não tira o prêmio", () => {
  const b = todasNoHorario(); b.delete("2026-10-13");
  const r = apurarMes(base({ primeiraBatida: b, abonos: new Set(["2026-10-13"]) }));
  assert.deepEqual(r.faltas, []);
  assert.equal(r.ganhou, true);
});

test("tolerância de 5 min por dia: 08:05 não conta, 08:08 conta 8", () => {
  const b = todasNoHorario();
  b.set("2026-10-12", "08:05"); b.set("2026-10-13", "08:05"); b.set("2026-10-14", "08:05");
  const r1 = apurarMes(base({ primeiraBatida: b, toleranciaBatida: 5 }));
  assert.equal(r1.atrasoTotal, 0);
  assert.equal(r1.ganhou, true);
  b.set("2026-10-15", "08:08"); b.set("2026-10-16", "08:08");
  const r2 = apurarMes(base({ primeiraBatida: b, toleranciaBatida: 5 }));
  assert.equal(r2.atrasoTotal, 16);
  assert.equal(r2.ganhou, false);
});
