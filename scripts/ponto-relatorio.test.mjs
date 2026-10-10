// Testes dos relatórios de ponto (src/lib/ponto-relatorio-core.ts).
// Rode: node --test scripts/ponto-relatorio.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { espelho, horasDoDia, duracao, porSemana } from "../src/lib/ponto-relatorio-core.ts";

const m = (s) => { const [h, mi] = s.split(":").map(Number); return h * 60 + mi; };
const ENT = { 1: "08:00", 2: "08:00", 3: "08:00", 4: "08:00", 5: "08:00", 6: "08:00" };
const SAI = { 1: "14:00", 2: "14:00", 3: "14:00", 4: "14:00", 5: "14:00", 6: "14:00" };
const base = (o = {}) => ({ dias: ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-18"], hoje: "2026-10-31", escala: [1, 2, 3, 4, 5, 6], entradas: ENT, saidas: SAI, batidas: new Map(), folgas: new Set(), atestados: new Set(), fechados: new Set(), ...o });

test("pares de batidas e batida faltando", () => {
  assert.deepEqual(horasDoDia([m("08:00"), m("14:00")]), { trabalhado: 360, incompleto: false });
  assert.deepEqual(horasDoDia([m("08:00"), m("11:00"), m("12:00"), m("14:30")]), { trabalhado: 330, incompleto: false });
  assert.deepEqual(horasDoDia([m("08:00"), m("11:00"), m("12:00")]), { trabalhado: 180, incompleto: true });
});

test("extra, atraso, falta e domingo fora", () => {
  const b = new Map([
    ["2026-10-12", [m("08:10"), m("15:00")]],  // atraso 10, trabalhou 6h50 → extra 50
    ["2026-10-13", [m("08:00"), m("13:00")]],  // 5h → faltou 1h
    ["2026-10-18", [m("09:00"), m("12:00")]],  // domingo, fora da escala → tudo extra
  ]);
  const { linhas, totais } = espelho(base({ batidas: b }));
  assert.equal(linhas[0].atrasoMin, 10);
  assert.equal(linhas[0].saldoMin, 50);
  assert.equal(linhas[1].saldoMin, -60);
  assert.equal(linhas[2].situacao, "falta");
  assert.equal(linhas[3].situacao, "ok");
  assert.equal(linhas[3].previstoMin, 0);
  assert.equal(linhas[0].extraMin, 60);   // saiu 1h depois
  assert.equal(linhas[0].faltaMin, 10);   // chegou 10 min atrasado
  assert.equal(totais.extra, 60 + 180);
  assert.equal(totais.faltante, 10 + 60 + 360);
  assert.equal(totais.faltas, 1);
});

test("folga e atestado não têm previsto", () => {
  const { linhas } = espelho(base({ folgas: new Set(["2026-10-12"]), atestados: new Set(["2026-10-13"]) }));
  assert.equal(linhas[0].situacao, "folga");
  assert.equal(linhas[0].previstoMin, 0);
  assert.equal(linhas[1].situacao, "atestado");
});

test("saída depois da meia-noite soma no dia", () => {
  const b = new Map([["2026-10-12", [m("18:00"), 1440 + m("00:30")]]]);
  const { linhas } = espelho(base({ batidas: b, dias: ["2026-10-12"], escala: [] }));
  assert.equal(linhas[0].trabalhadoMin, 390);
});

test("hoje sem batida não é falta nem faltante", () => {
  const { linhas, totais } = espelho(base({ dias: ["2026-10-14"], hoje: "2026-10-14" }));
  assert.equal(linhas[0].situacao, "hoje");
  assert.equal(totais.faltante, 0);
});

test("duração e semana", () => {
  assert.equal(duracao(135), "2h15");
  assert.equal(duracao(-20), "-0h20");
  const { linhas } = espelho(base({ batidas: new Map([["2026-10-12", [m("08:00"), m("14:00")]]]) }));
  assert.equal(porSemana(linhas)[0].segunda, "2026-10-12");
});

test("tolerância igual ao RHiD: espelho do Carlos de 21/09 a 01/10/2026 bate com o print", () => {
  const dias = ["2026-09-21","2026-09-22","2026-09-23","2026-09-24","2026-09-25","2026-09-26","2026-09-27","2026-09-28","2026-09-29","2026-09-30","2026-10-01"];
  const pares = [["15:06"],["08:01","14:14"],["08:03","14:50"],["07:52","15:15"],["08:00","15:00"],["07:58","15:23"],[],["08:03","14:30"],["08:01","14:53"],["07:58","14:52"],["07:55","18:05"]];
  const b = new Map(dias.map((d, i) => [d, pares[i].map(m)]).filter(([, v]) => v.length));
  const { linhas, totais } = espelho(base({ dias, batidas: b, tolerancia: 5, limite: 10 }));
  const extraRhid = [0, 14, 50, 83, 60, 85, 0, 30, 53, 54, 250];
  assert.deepEqual(linhas.map((l) => l.extraMin), extraRhid);
  assert.equal(linhas[0].faltaMin, 360);          // só a entrada 15:06: falta o dia todo
  assert.equal(linhas[1].faltaMin, 0);            // 08:01: dentro dos 5 min
  assert.equal(linhas[1].atrasoMin, 0);
  assert.equal(duracao(totais.extra), "11h19");   // total do RHiD
  assert.equal(duracao(totais.previsto - totais.faltante), "54h00"); // Total Normais do RHiD
});
