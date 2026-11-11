// Testes do serviço só à noite (CX-10, src/app/(painel)/salao/util.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { servicoAgora } from "../src/app/(painel)/salao/util.ts";

const cfg = { servico_percent: "10", servico_so_noite: "1", servico_inicio: "18:00" };
const sp = (hhmm) => Date.parse(`2026-11-13T${hhmm}:00-03:00`);

test("serviço só à noite", () => {
  assert.equal(servicoAgora(cfg, sp("12:30")), 0);
  assert.equal(servicoAgora(cfg, sp("17:59")), 0);
  assert.equal(servicoAgora(cfg, sp("18:00")), 10);
  assert.equal(servicoAgora(cfg, sp("23:50")), 10);
  assert.equal(servicoAgora(cfg, sp("00:30")), 10);
  assert.equal(servicoAgora(cfg, sp("04:59")), 10);
  assert.equal(servicoAgora(cfg, sp("05:00")), 0);
});

test("serviço o dia todo e sem serviço", () => {
  assert.equal(servicoAgora({ ...cfg, servico_so_noite: "0" }, sp("12:30")), 10);
  assert.equal(servicoAgora({ servico_percent: "0" }, sp("20:00")), 0);
});
