// Saúde do sistema (auditoria, Onda 2): trava das buscas forçadas da SEFAZ
// (src/lib/sefaz/trava.ts, NFE-02) e horário de serviço
// (src/lib/horario-servico.ts, usado pra não alarmar balança/pinpad desligados).
// Rode: node --test scripts/saude.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { podeForcar } from "../src/lib/sefaz/trava.ts";
import { emServico } from "../src/lib/horario-servico.ts";

const AGORA = Date.parse("2026-11-09T15:00:00Z"); // 12:00 em Brasília
const min = (n) => new Date(AGORA + n * 60_000).toISOString();

test("sem trava: pode buscar", () => {
  assert.deepEqual(podeForcar({ bloqueado_ate: min(-1) }, false, AGORA), { ok: true });
  assert.deepEqual(podeForcar({}, true, AGORA), { ok: true });
});

test("depois de um 656 nada pula a espera, nem o botão", () => {
  const cfg = { bloqueado_ate: min(40), ultimo_cstat: "656", forcado_em: min(-120) };
  assert.equal(podeForcar(cfg, false, AGORA).ok, false);
  const r = podeForcar(cfg, true, AGORA);
  assert.equal(r.ok, false);
  assert.match(r.erro, /656/);
});

test("automática: no mínimo 10 min entre buscas forçadas", () => {
  const travada = { bloqueado_ate: min(50), ultimo_cstat: "137" };
  assert.equal(podeForcar({ ...travada, forcado_em: min(-5) }, false, AGORA).ok, false);
  assert.equal(podeForcar({ ...travada, forcado_em: min(-11) }, false, AGORA).ok, true);
  assert.equal(podeForcar({ ...travada, forcado_em: null }, false, AGORA).ok, true);
});

test("botão do usuário: no máximo 1 vez por hora", () => {
  const travada = { bloqueado_ate: min(50), ultimo_cstat: "137" };
  const r = podeForcar({ ...travada, forcado_em: min(-30) }, true, AGORA);
  assert.equal(r.ok, false);
  assert.match(r.erro, /próxima busca/);
  assert.equal(podeForcar({ ...travada, forcado_em: min(-61) }, true, AGORA).ok, true);
});

test("horário de serviço: almoço de segunda a sábado, noite só sexta e sábado", () => {
  const br = (iso) => new Date(iso + "-03:00");
  assert.equal(emServico(br("2026-11-09T12:00:00")), true); // segunda, almoço
  assert.equal(emServico(br("2026-11-09T10:59:00")), false); // segunda, antes
  assert.equal(emServico(br("2026-11-09T14:30:00")), true); // folga do almoço
  assert.equal(emServico(br("2026-11-09T19:30:00")), false); // segunda à noite
  assert.equal(emServico(br("2026-11-13T19:30:00")), true); // sexta à noite
  assert.equal(emServico(br("2026-11-14T22:30:00")), true); // sábado, folga da noite
  assert.equal(emServico(br("2026-11-15T12:00:00")), false); // domingo
});
