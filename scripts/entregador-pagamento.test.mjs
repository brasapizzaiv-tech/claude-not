// Testes do acerto do entregador (src/lib/entregador-pagamento.ts).
// Rode: node --test scripts/entregador-pagamento.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { acertoDoDia } from "../src/lib/entregador-pagamento.ts";

const FIXO = { fixoDia: 70, fixoNoite: 50, valorTele: null, gratisIncluidasDia: 3, valorGratisExtraDia: 3 };
const e = (id, hh, gratis, valorArea = 8) => ({ id, quando: `2026-10-28T${String(hh).padStart(2, "0")}:${id.padStart(2, "0")}:00`, hora: hh, gratis, valorArea });

test("almoço: 3 grátis no fixo, depois R$ 3; cobrada paga a área", () => {
  const r = acertoDoDia(FIXO, [e("1", 11, true), e("2", 11, true), e("3", 12, true), e("4", 12, true), e("5", 12, true), e("6", 13, false, 12)]);
  assert.equal(r.fixo, 70);
  assert.equal(r.gratisDia, 5);
  assert.equal(r.porEntrega.get("3"), 0);
  assert.equal(r.porEntrega.get("4"), 3);
  assert.equal(r.porEntrega.get("6"), 12);
  assert.equal(r.teles, 3 + 3 + 12);
  assert.equal(r.total, 88);
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

test("eventual sem regra: toda tele paga a área (ou o valor dele)", () => {
  const r = acertoDoDia({ fixoDia: null, fixoNoite: 30, valorTele: 5, gratisIncluidasDia: null, valorGratisExtraDia: null },
    [e("1", 11, true, 6), e("2", 19, false, null)]);
  assert.equal(r.porEntrega.get("1"), 6);
  assert.equal(r.porEntrega.get("2"), 5);
  assert.equal(r.fixo, 30);
  assert.equal(r.gratisIncluidas, null);
});
