// Testes de "em quais marmitas vai cada prato" (src/lib/marmitas-marcas.ts).
// Rode: node --test scripts/marmitas-marcas.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { marcasDoDia, marcarPratoNovo } from "../src/lib/marmitas-marcas.ts";

const PRATOS = ["Frango", "Suíno", "Arroz", "Feijão"];

test("dia sem marcação: Tradicional tudo, Do Dia nada, Premium só no sábado", () => {
  const qua = marcasDoDia(null, PRATOS, 3);
  assert.deepEqual(qua, { tradicional: PRATOS, dia: [], premium: [] });
  assert.deepEqual(marcasDoDia(null, PRATOS, 6).premium, PRATOS);
});

test("marcação salva vale, e prato que saiu do dia some", () => {
  const m = marcasDoDia({ tradicional: ["Frango", "Arroz", "Lasanha"], dia: ["Arroz"], premium: ["Frango"] }, PRATOS, 6);
  assert.deepEqual(m, { tradicional: ["Frango", "Arroz"], dia: ["Arroz"], premium: ["Frango"] });
});

test("prato novo entra na Tradicional (e na Premium no sábado), não na Do Dia", () => {
  const base = { tradicional: [], dia: [], premium: [] };
  assert.deepEqual(marcarPratoNovo(base, "Polenta", 2), { tradicional: ["Polenta"], dia: [], premium: [] });
  assert.deepEqual(marcarPratoNovo(base, "Polenta", 6), { tradicional: ["Polenta"], dia: [], premium: ["Polenta"] });
});
