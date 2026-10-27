// Testes dos relatórios gerenciais do ponto (src/lib/ponto-relatorios-core.ts).
// Rode: node --test scripts/ponto-relatorios.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { espelho } from "../src/lib/ponto-relatorio-core.ts";
import { resumoMes, absenteismo, turnover } from "../src/lib/ponto-relatorios-core.ts";

const m = (s) => { const [h, mi] = s.split(":").map(Number); return h * 60 + mi; };
const ENT = { 1: "08:00", 2: "08:00", 3: "08:00", 4: "08:00", 5: "08:00", 6: "08:00" };
const SAI = { 1: "14:00", 2: "14:00", 3: "14:00", 4: "14:00", 5: "14:00", 6: "14:00" };
// Seg 12 a sáb 17/10 + seg 19/10.
const DIAS = ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-19"];
const rodar = (o = {}) => espelho({
  dias: DIAS, hoje: "2026-10-31", escala: [1, 2, 3, 4, 5, 6], entradas: ENT, saidas: SAI,
  batidas: new Map([
    ["2026-10-12", [m("08:00"), m("14:00")]],
    ["2026-10-13", [m("08:30"), m("14:00")]],   // 30 min de atraso
    ["2026-10-15", [m("08:00"), m("15:00")]],   // 1h extra
    ["2026-10-17", [m("08:00"), m("14:00")]],
  ]),
  folgas: new Set(["2026-10-16"]), atestados: new Set(["2026-10-19"]), fechados: new Set(),
  justificativas: new Map([["2026-10-19", "Atestado médico"]]),
  ...o,
});

test("resumo do mês pro contador", () => {
  const { linhas, totais } = rodar();
  const r = resumoMes(linhas, totais);
  assert.equal(r.diasTrabalhados, 4);
  assert.equal(r.faltas, 1);            // 14/10
  assert.equal(r.dsrPerdidos, 1);       // a semana do dia 12
  assert.equal(r.faltaMin, 30 + 360);
  assert.equal(r.extra, 60);
  assert.equal(r.folgas, 1);
  assert.deepEqual(r.justificados, { "Atestado médico": 1 });
});

test("absenteísmo: falta, atraso e atestado; folga fora da conta", () => {
  const { linhas } = rodar();
  const a = absenteismo(linhas);
  assert.equal(a.previstoMin, 6 * 360);  // 7 dias menos a folga
  assert.equal(a.faltasMin, 360);
  assert.equal(a.atrasosMin, 30);
  assert.equal(a.justificadoMin, 360);
  assert.equal(a.ausenteMin, 750);
  assert.ok(Math.abs(a.indice - 750 / 2160) < 1e-9);
});

test("turnover", () => {
  const t = turnover([
    { id: "a", nome: "A", admissao: "2025-01-01", desligamento: null },
    { id: "b", nome: "B", admissao: null, desligamento: "2026-10-10" },
    { id: "c", nome: "C", admissao: "2026-10-05", desligamento: null },
    { id: "d", nome: "D", admissao: "2024-01-01", desligamento: "2026-08-01" },
  ], "2026-09-21", "2026-10-20");
  assert.equal(t.inicio, 2);
  assert.equal(t.fim, 2);
  assert.deepEqual(t.admitidos.map((p) => p.id), ["c"]);
  assert.deepEqual(t.desligados.map((p) => p.id), ["b"]);
  assert.equal(t.indice, 0.5);
});
