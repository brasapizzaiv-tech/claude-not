// Feriados fechados (src/lib/feriados-fechados.ts) e a virada do cardápio pulando feriado.
// Rode: node --test scripts/feriados-fechados.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { expandirFechados } from "../src/lib/feriados-fechados.ts";
import { diaDoCardapio } from "../src/lib/dia-cardapio.ts";

const sp = (iso, hhmm) => Date.parse(`${iso}T${hhmm}:00-03:00`);

test("período de feriado vira um dia por data, só dentro da janela", () => {
  const m = expandirFechados([
    { data: "2026-12-25", data_fim: null, nome: "Natal" },
    { data: "2026-12-28", data_fim: "2027-01-02", nome: "Férias" },
    { data: "2027-01-01", data_fim: null, nome: "Ano Novo" },
  ], "2026-12-20", "2026-12-31");
  assert.deepEqual([...m.keys()], ["2026-12-25", "2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31"]);
  assert.equal(m.get("2026-12-29"), "Férias");
});

test("período que começa antes da janela entra a partir do início dela", () => {
  const m = expandirFechados([{ data: "2026-12-28", data_fim: "2027-01-02", nome: "Férias" }], "2027-01-01", "2027-01-10");
  assert.deepEqual([...m.keys()], ["2027-01-01", "2027-01-02"]);
});

test("fim antes do início é ignorado (data digitada errada)", () => {
  assert.equal(expandirFechados([{ data: "2026-12-28", data_fim: "2026-12-20", nome: "x" }], "2026-12-01", "2026-12-31").size, 0);
});

test("véspera do Natal depois das 13:30: a TV pula o 25 e mostra o 26", () => {
  const fechados = new Set(["2026-12-25"]);
  assert.equal(diaDoCardapio(sp("2026-12-24", "13:31"), fechados), "2026-12-26");
  assert.equal(diaDoCardapio(sp("2026-12-24", "13:31")), "2026-12-25"); // sem a lista, como antes
});

test("férias coletivas: sábado 26/12 depois da virada pula domingo e o período todo", () => {
  const fechados = new Set(["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
  assert.equal(diaDoCardapio(sp("2026-12-26", "14:00"), fechados), "2027-01-04");
});
