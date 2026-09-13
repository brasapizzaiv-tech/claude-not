// Testes dos horários/agendamento do delivery (src/lib/delivery-horarios.ts).
// Rode: node --test scripts/delivery-horarios.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { HORARIOS_PADRAO, estadoDelivery, slotsAgendamento, lerConfigHorarios, hhmmDe } from "../src/lib/delivery-horarios.ts";

const sp = (iso, hhmm) => Date.parse(`${iso}T${hhmm}:00-03:00`);
const cfg = HORARIOS_PADRAO;
// 2026-09-14 = segunda · 15 terça · 16 quarta · 19 sábado · 20 domingo

test("segunda 12:00 → almoço livre, fecha 13:20", () => {
  const e = estadoDelivery(cfg, sp("2026-09-14", "12:00"));
  assert.equal(e.livre, true); assert.equal(e.turnoLivre.id, "almoco"); assert.equal(e.fechaEm, "13:20");
});
test("segunda 10:00 → fechado, agendamento do almoço já aberto, abre hoje às 11:15", () => {
  const e = estadoDelivery(cfg, sp("2026-09-14", "10:00"));
  assert.equal(e.livre, false); assert.equal(e.agendamentoAberto, true); assert.equal(e.proximaAbertura.texto, "hoje às 11:15");
});
test("segunda 08:00 → agendamento ainda fechado", () => {
  assert.equal(estadoDelivery(cfg, sp("2026-09-14", "08:00")).agendamentoAberto, false);
});
test("segunda 19:00 → sem noite na segunda; próxima abertura amanhã às 11:15", () => {
  const e = estadoDelivery(cfg, sp("2026-09-14", "19:00"));
  assert.equal(e.livre, false); assert.equal(e.proximaAbertura.texto, "amanhã às 11:15");
});
test("quarta 19:00 → noite livre", () => {
  const e = estadoDelivery(cfg, sp("2026-09-16", "19:00"));
  assert.equal(e.livre, true); assert.equal(e.turnoLivre.id, "noite"); assert.equal(e.fechaEm, "22:00");
});
test("quarta 22:00 → fechou (22:00 não entra); próxima amanhã às 11:15", () => {
  const e = estadoDelivery(cfg, sp("2026-09-16", "22:00"));
  assert.equal(e.livre, false); assert.equal(e.proximaAbertura.texto, "amanhã às 11:15");
});
test("domingo → fechado o dia todo; abre amanhã (segunda) às 11:15", () => {
  const e = estadoDelivery(cfg, sp("2026-09-20", "12:00"));
  assert.equal(e.livre, false); assert.equal(e.agendamentoAberto, false); assert.equal(e.proximaAbertura.texto, "amanhã às 11:15");
});
test("sábado 23:00 → próxima abertura segunda (pula domingo)", () => {
  assert.equal(estadoDelivery(cfg, sp("2026-09-19", "23:00")).proximaAbertura.texto, "segunda às 11:15");
});

test("slots: segunda 09:00 → almoço 11:15..13:20 de 15 em 15 (9 horários), nada de noite", () => {
  const s = slotsAgendamento(cfg, sp("2026-09-14", "09:00"));
  assert.deepEqual(s.map((x) => x.label), ["11:15", "11:30", "11:45", "12:00", "12:15", "12:30", "12:45", "13:00", "13:15"]);
  assert.ok(s.every((x) => x.turno === "Almoço"));
});
test("slots: respeita a antecedência de 30 min (segunda 12:00 → a partir de 12:30)", () => {
  const s = slotsAgendamento(cfg, sp("2026-09-14", "12:00"));
  assert.deepEqual(s.map((x) => x.label), ["12:30", "12:45", "13:00", "13:15"]);
});
test("slots: quarta 16:00 → só a noite (almoço já passou), 18:30..22:00", () => {
  const s = slotsAgendamento(cfg, sp("2026-09-16", "16:00"));
  assert.equal(s[0].label, "18:30"); assert.equal(s[s.length - 1].label, "22:00"); assert.equal(s.length, 15);
});
test("slots: quarta 14:00 → noite ainda não abriu o agendamento (15:00) → vazio", () => {
  assert.equal(slotsAgendamento(cfg, sp("2026-09-16", "14:00")).length, 0);
});
test("slot em ISO bate com o horário de SP", () => {
  const s = slotsAgendamento(cfg, sp("2026-09-14", "09:00"))[0];
  assert.equal(hhmmDe(Date.parse(s.iso)), "11:15");
});
test("config: jsonb vazio vira padrão; intervalo/mínimo respeitados", () => {
  assert.deepEqual(lerConfigHorarios(null), HORARIOS_PADRAO);
  const c = lerConfigHorarios({ horarios: { intervaloMin: 30, pedidoMinimo: 40, turnos: [{ id: "x", nome: "X", dias: [1], agendaAbre: "08:00", livreAbre: "10:00", livreFecha: "11:00" }] } });
  assert.equal(c.intervaloMin, 30); assert.equal(c.pedidoMinimo, 40); assert.equal(c.turnos.length, 1);
  assert.deepEqual(slotsAgendamento(c, sp("2026-09-14", "08:30")).map((x) => x.label), ["10:00", "10:30", "11:00"]);
});
