// Testes do acerto do entregador (src/lib/entregador-pagamento.ts).
// Rode: node --test scripts/entregador-pagamento.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { acertoDoDia } from "../src/lib/entregador-pagamento.ts";

const FIXO = { fixoDia: 70, fixoNoite: 50, valorTele: null, gratisIncluidasDia: 10, valorGratisExtraDia: 3, trabalhaDia: true, trabalhaNoite: true };
const e = (id, hh, gratis, valorArea = 8) => ({ id, quando: `2026-10-28T${String(hh).padStart(2, "0")}:${id.padStart(2, "0")}:00`, hora: hh, gratis, valorArea });
const gratisAlmoco = (n) => Array.from({ length: n }, (_, i) => e(String(i + 1), 12, true));

test("almoço: 10 grátis no fixo, da 11ª em diante R$ 3", () => {
  const r = acertoDoDia(FIXO, gratisAlmoco(12));
  assert.equal(r.fixo, 70);
  assert.equal(r.porEntrega.get("10"), 0);
  assert.equal(r.porEntrega.get("11"), 3);
  assert.equal(r.total, 76);
});

test("almoço: tele cobrada paga a área e não conta nas 10", () => {
  const r = acertoDoDia(FIXO, [...gratisAlmoco(10), e("40", 13, false, 12), e("41", 13, false, 16)]);
  assert.equal(r.gratisDia, 10);
  assert.equal(r.porEntrega.get("40"), 12);
  assert.equal(r.teles, 28);
  assert.equal(r.total, 98);
});

test("noite: fixo 50 + valor da área de todas, inclusive grátis", () => {
  const r = acertoDoDia(FIXO, [e("1", 19, true, 6), e("2", 20, false, 10)]);
  assert.equal(r.fixo, 50);
  assert.equal(r.teles, 16);
  assert.ok(!r.fezDia && r.fezNoite);
});

test("almoço e noite no mesmo dia somam os dois fixos", () => {
  const r = acertoDoDia(FIXO, [e("1", 12, true), e("2", 19, false, 8)]);
  assert.equal(r.fixo, 120);
  assert.equal(r.teles, 8);
});

test("só noite: cobrindo no almoço ganha só a área, sem fixo nem grátis no fixo", () => {
  const r = acertoDoDia({ ...FIXO, trabalhaDia: false }, [e("1", 12, true, 6), e("2", 19, false, 8)]);
  assert.equal(r.fixo, 50);
  assert.equal(r.porEntrega.get("1"), 6);
  assert.equal(r.gratisIncluidas, null);
});

test("só almoço: tele à noite paga a área, sem fixo da noite", () => {
  const r = acertoDoDia({ ...FIXO, trabalhaNoite: false }, [e("1", 12, true), e("2", 20, false, 10)]);
  assert.equal(r.fixo, 70);
  assert.equal(r.teles, 10);
});

test("eventual sem regra: toda tele paga a área (ou o valor dele)", () => {
  const r = acertoDoDia({ fixoDia: null, fixoNoite: 30, valorTele: 5, gratisIncluidasDia: null, valorGratisExtraDia: null },
    [e("1", 11, true, 6), e("2", 19, false, null)]);
  assert.equal(r.porEntrega.get("1"), 6);
  assert.equal(r.porEntrega.get("2"), 5);
  assert.equal(r.fixo, 30);
  assert.equal(r.gratisIncluidas, null);
});
