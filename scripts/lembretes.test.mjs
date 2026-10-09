// Testes da regra dos lembretes da equipe (src/lib/lembretes-core.ts).
// Rode: node --test scripts/lembretes.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { valeNoDia, ehPara, lembretesDaPessoa, resumoQuando, diaDaSemana } from "../src/lib/lembretes-core.ts";

const base = { id: "L", titulo: "x", texto: null, tipo: "aviso", para: "todos", setorIds: [], colaboradorIds: [], repeticao: "uma_vez", data: "2026-10-09", ate: null, dias: [], diaMes: null, hora: null, ativo: true };
const L = (o) => ({ ...base, ...o });

test("dia da semana sem fuso", () => {
  assert.equal(diaDaSemana("2026-10-09"), 5); // sexta
  assert.equal(diaDaSemana("2026-10-11"), 0); // domingo
});

test("uma vez: só no dia", () => {
  assert.equal(valeNoDia(L({}), "2026-10-09"), true);
  assert.equal(valeNoDia(L({}), "2026-10-10"), false);
  assert.equal(valeNoDia(L({}), "2026-10-08"), false);
});

test("desligado não vale", () => {
  assert.equal(valeNoDia(L({ ativo: false }), "2026-10-09"), false);
});

test("todo dia, a partir de e até", () => {
  const l = L({ repeticao: "diario", data: "2026-10-09", ate: "2026-10-12" });
  assert.equal(valeNoDia(l, "2026-10-08"), false);
  assert.equal(valeNoDia(l, "2026-10-12"), true);
  assert.equal(valeNoDia(l, "2026-10-13"), false);
});

test("semanal: só nos dias marcados", () => {
  const l = L({ repeticao: "semanal", dias: [1, 3] }); // seg e qua
  assert.equal(valeNoDia(l, "2026-10-12"), true);  // seg
  assert.equal(valeNoDia(l, "2026-10-13"), false); // ter
  assert.equal(valeNoDia(l, "2026-10-14"), true);  // qua
});

test("mensal: dia 31 cai no último dia do mês curto", () => {
  const l = L({ repeticao: "mensal", diaMes: 31, data: "2026-01-01" });
  assert.equal(valeNoDia(l, "2026-11-30"), true);
  assert.equal(valeNoDia(l, "2026-11-29"), false);
  assert.equal(valeNoDia(l, "2026-12-31"), true);
  assert.equal(valeNoDia(l, "2027-02-28"), true);
});

test("pra quem: todos, setor, pessoa", () => {
  const p = { id: "ana", setores: ["cozinha"] };
  assert.equal(ehPara(L({}), p), true);
  assert.equal(ehPara(L({ para: "setores", setorIds: ["salao"] }), p), false);
  assert.equal(ehPara(L({ para: "setores", setorIds: ["salao", "cozinha"] }), p), true);
  assert.equal(ehPara(L({ para: "pessoas", colaboradorIds: ["bia"] }), p), false);
  assert.equal(ehPara(L({ para: "pessoas", colaboradorIds: ["ana"] }), p), true);
});

test("uma vez não confirmado continua aparecendo até 7 dias, marcado como atrasado", () => {
  const p = { id: "ana", setores: [] };
  const l = L({ data: "2026-10-05" });
  const r = lembretesDaPessoa([l], p, "2026-10-09", new Set());
  assert.equal(r.length, 1);
  assert.equal(r[0].atrasado, true);
  assert.equal(r[0].dia, "2026-10-05");
  assert.equal(lembretesDaPessoa([l], p, "2026-10-13", new Set()).length, 0);
  assert.equal(lembretesDaPessoa([l], p, "2026-10-09", new Set(["L|2026-10-05"])).length, 0);
});

test("repetido: confirmação vale só pro dia", () => {
  const p = { id: "ana", setores: [] };
  const l = L({ repeticao: "diario", data: "2026-10-01" });
  const ontem = lembretesDaPessoa([l], p, "2026-10-09", new Set(["L|2026-10-08"]));
  assert.equal(ontem[0].confirmado, false);
  const hoje = lembretesDaPessoa([l], p, "2026-10-09", new Set(["L|2026-10-09"]));
  assert.equal(hoje[0].confirmado, true);
});

test("ordem pela hora", () => {
  const p = { id: "ana", setores: [] };
  const r = lembretesDaPessoa([L({ id: "b", titulo: "B", hora: "15:00" }), L({ id: "a", titulo: "A", hora: "09:00" })], p, "2026-10-09", new Set());
  assert.deepEqual(r.map((x) => x.lembrete.id), ["a", "b"]);
});

test("resumo do quando", () => {
  assert.equal(resumoQuando(L({ hora: "15:00" })), "09/10 às 15:00");
  assert.equal(resumoQuando(L({ repeticao: "semanal", dias: [0, 3, 1] })), "Toda seg, qua, dom");
  assert.equal(resumoQuando(L({ repeticao: "mensal", diaMes: 5 })), "Todo dia 5 do mês");
});
