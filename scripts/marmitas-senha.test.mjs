// Senhas do app das marmitas (src/lib/marmitas-senha.ts, auditoria SEC-06).
// Rode: node --test scripts/marmitas-senha.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { hashSenha, senhaBate, senhaEmTexto } from "../src/lib/marmitas-senha.ts";

test("hash novo confere só com a senha certa", () => {
  const h = hashSenha("kern2026");
  assert.match(h, /^s1:[0-9a-f]{32}:[0-9a-f]{64}$/);
  assert.equal(senhaBate(h, "kern2026"), true);
  assert.equal(senhaBate(h, "kern2027"), false);
  assert.equal(senhaEmTexto(h), false);
});

test("senha antiga em texto ainda entra (e é marcada pra virar hash)", () => {
  assert.equal(senhaBate("1234", "1234"), true);
  assert.equal(senhaBate("1234", "12345"), false);
  assert.equal(senhaEmTexto("1234"), true);
});

test("vazio nunca entra", () => {
  assert.equal(senhaBate("", ""), false);
  assert.equal(senhaBate(hashSenha("abcdef"), ""), false);
});
