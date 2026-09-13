// Testes das áreas de entrega e promoções da taxa (src/lib/delivery-areas.ts).
// Rode: node --test scripts/delivery-areas.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { dentroDoPoligono, areaDoPonto, aplicarPromoTele, promoVale } from "../src/lib/delivery-areas.ts";

const sp = (iso, hhmm) => Date.parse(`${iso}T${hhmm}:00-03:00`);
// quadrado em volta do centro de Ivoti
const centro = { id: "c", nome: "Centro", cor: "#000", valor: 6, taxa_motoboy: 4, tempo_min: 30, ativo: true,
  poligono: [[-29.585, -51.170], [-29.585, -51.150], [-29.600, -51.150], [-29.600, -51.170]] };
const longe = { ...centro, id: "l", nome: "Longe", valor: 12, poligono: [[-29.62, -51.18], [-29.62, -51.16], [-29.64, -51.16], [-29.64, -51.18]] };

test("ponto dentro / fora do polígono", () => {
  assert.equal(dentroDoPoligono(-29.5906, -51.1606, centro.poligono), true);
  assert.equal(dentroDoPoligono(-29.70, -51.30, centro.poligono), false);
  assert.equal(dentroDoPoligono(-29.59, -51.16, [[-29.5, -51.1], [-29.6, -51.2]]), false, "2 pontos não é polígono");
});
test("areaDoPonto: acha a área certa; fora de todas → null; área inativa não conta", () => {
  assert.equal(areaDoPonto([centro, longe], -29.5906, -51.1606)?.nome, "Centro");
  assert.equal(areaDoPonto([centro, longe], -29.63, -51.17)?.nome, "Longe");
  assert.equal(areaDoPonto([centro, longe], -29.9, -51.9), null);
  assert.equal(areaDoPonto([{ ...centro, ativo: false }], -29.5906, -51.1606), null);
});

const quartaGratis = { id: "p1", nome: "Quarta grátis", tipo: "gratis", valor: 0, area_ids: null, pedido_minimo: null, dias: [3], hora_ini: null, hora_fim: null, validade: null, ativo: true };
const acima60 = { id: "p2", nome: "Acima de 60", tipo: "valor", valor: 3, area_ids: ["c"], pedido_minimo: 60, dias: null, hora_ini: null, hora_fim: null, validade: null, ativo: true };
const noite50 = { id: "p3", nome: "Noite 50%", tipo: "percent", valor: 50, area_ids: null, pedido_minimo: null, dias: null, hora_ini: "18:30", hora_fim: "22:00", validade: null, ativo: true };

test("promo por dia: quarta vale, quinta não", () => {
  assert.equal(promoVale(quartaGratis, { areaId: "c", subtotal: 30, agora: sp("2026-09-16", "19:00") }), true);
  assert.equal(promoVale(quartaGratis, { areaId: "c", subtotal: 30, agora: sp("2026-09-17", "19:00") }), false);
});
test("promo por área e mínimo", () => {
  assert.equal(promoVale(acima60, { areaId: "c", subtotal: 59.9, agora: sp("2026-09-17", "12:00") }), false);
  assert.equal(promoVale(acima60, { areaId: "c", subtotal: 60, agora: sp("2026-09-17", "12:00") }), true);
  assert.equal(promoVale(acima60, { areaId: "l", subtotal: 100, agora: sp("2026-09-17", "12:00") }), false);
});
test("promo por horário", () => {
  assert.equal(promoVale(noite50, { areaId: "c", subtotal: 30, agora: sp("2026-09-17", "19:00") }), true);
  assert.equal(promoVale(noite50, { areaId: "c", subtotal: 30, agora: sp("2026-09-17", "12:00") }), false);
});
test("aplica a MELHOR promoção (maior desconto) e devolve o motivo", () => {
  const r = aplicarPromoTele(6, [quartaGratis, acima60, noite50], { areaId: "c", subtotal: 80, agora: sp("2026-09-16", "19:00") });
  assert.equal(r.taxa, 0); assert.match(r.motivo, /grátis/);
  const r2 = aplicarPromoTele(6, [acima60, noite50], { areaId: "c", subtotal: 80, agora: sp("2026-09-17", "19:00") });
  assert.equal(r2.taxa, 3); // R$ 3 de desconto (3,00) empata com 50% (3,00) → primeira melhor
  const r3 = aplicarPromoTele(6, [acima60], { areaId: "c", subtotal: 20, agora: sp("2026-09-17", "19:00") });
  assert.equal(r3.taxa, 6); assert.equal(r3.motivo, null);
});
test("promo inativa ou vencida não vale", () => {
  assert.equal(promoVale({ ...quartaGratis, ativo: false }, { areaId: "c", subtotal: 30, agora: sp("2026-09-16", "19:00") }), false);
  assert.equal(promoVale({ ...quartaGratis, validade: "2026-09-01" }, { areaId: "c", subtotal: 30, agora: sp("2026-09-16", "19:00") }), false);
});
