// Testes da regra "qual dia de cardápio vale agora" (src/lib/dia-cardapio.ts).
// Rode: node --test scripts/dia-cardapio.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { diaDoCardapio, rotuloDia, paginaDaRotacao, TV_ROTACAO_SEG } from "../src/lib/dia-cardapio.ts";

// Horário de São Paulo (UTC−3, sem horário de verão) → timestamp.
const sp = (iso, hhmm) => Date.parse(`${iso}T${hhmm}:00-03:00`);

// Semana de referência: 2026-09-14 é segunda-feira.
test("segunda 13:29 → ainda o cardápio de segunda", () => {
  assert.equal(diaDoCardapio(sp("2026-09-14", "13:29")), "2026-09-14");
});
test("segunda 13:30 → cardápio de terça", () => {
  assert.equal(diaDoCardapio(sp("2026-09-14", "13:30")), "2026-09-15");
});
test("terça 13:29 → ainda terça", () => {
  assert.equal(diaDoCardapio(sp("2026-09-15", "13:29")), "2026-09-15");
});
test("terça 00:05 (madrugada) → terça", () => {
  assert.equal(diaDoCardapio(sp("2026-09-15", "00:05")), "2026-09-15");
});
test("sexta 13:30 → sábado", () => {
  assert.equal(diaDoCardapio(sp("2026-09-18", "13:30")), "2026-09-19");
});
test("sábado 13:29 → ainda sábado", () => {
  assert.equal(diaDoCardapio(sp("2026-09-19", "13:29")), "2026-09-19");
});
test("sábado 13:30 → segunda (pula domingo)", () => {
  assert.equal(diaDoCardapio(sp("2026-09-19", "13:30")), "2026-09-21");
});
test("domingo de manhã → segunda", () => {
  assert.equal(diaDoCardapio(sp("2026-09-20", "09:00")), "2026-09-21");
});
test("domingo à noite → segunda", () => {
  assert.equal(diaDoCardapio(sp("2026-09-20", "22:00")), "2026-09-21");
});
test("virada de mês: quarta 30/09 13:30 → quinta 01/10", () => {
  assert.equal(diaDoCardapio(sp("2026-09-30", "13:30")), "2026-10-01");
});
test("usa o fuso de São Paulo, não o UTC: 23:30 SP de segunda ainda é terça (já virou às 13:30)", () => {
  // 2026-09-14T23:30-03:00 = 2026-09-15T02:30Z; pelo UTC seria dia 15 antes das 13:30 → "15" também,
  // mas às 12:00 SP (15:00Z) de segunda, pelo UTC já teria virado e pelo SP não.
  assert.equal(diaDoCardapio(sp("2026-09-14", "12:00")), "2026-09-14");
});
test("rótulo do cabeçalho", () => {
  assert.equal(rotuloDia("2026-09-15"), "TERÇA, 15/09");
  assert.equal(rotuloDia("2026-09-19"), "SÁBADO, 19/09");
});
test("rotação das páginas segue o relógio", () => {
  const t0 = 1_700_000_000_000;
  const base = paginaDaRotacao(t0, 4);
  assert.equal(paginaDaRotacao(t0 + TV_ROTACAO_SEG * 1000 * 4, 4), base); // 4 páginas depois, volta
  assert.notEqual(paginaDaRotacao(t0 + TV_ROTACAO_SEG * 1000, 4), base);
});
