// Cookie assinado do modo garçom (src/lib/garcom-assinatura.ts).
// Rode: node --test scripts/garcom-assinatura.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { cookieGarcomConfere, montarCookieGarcom, tokenDoValor } from "../src/lib/garcom-assinatura.ts";

const CHAVE = "chave-de-teste";
const TOKEN = "a1b2c3d4e5f60718";

test("o cookie que o servidor gera confere (com e sem PIN)", () => {
  assert.ok(cookieGarcomConfere(CHAVE, montarCookieGarcom(CHAVE, TOKEN, "1234"), TOKEN, "1234"));
  assert.ok(cookieGarcomConfere(CHAVE, montarCookieGarcom(CHAVE, TOKEN, null), TOKEN, null));
  assert.equal(tokenDoValor(montarCookieGarcom(CHAVE, TOKEN, "1234")), TOKEN);
});

test("só o token (formato antigo) ou assinatura inventada não entram", () => {
  assert.equal(cookieGarcomConfere(CHAVE, TOKEN, TOKEN, "1234"), false);
  assert.equal(tokenDoValor(TOKEN), "");
  assert.equal(cookieGarcomConfere(CHAVE, `${TOKEN}.qualquercoisa`, TOKEN, "1234"), false);
  assert.equal(cookieGarcomConfere(CHAVE, `${TOKEN}.`, TOKEN, "1234"), false);
});

test("trocar o PIN, outra chave ou outro token derrubam o cookie", () => {
  const v = montarCookieGarcom(CHAVE, TOKEN, "1234");
  assert.equal(cookieGarcomConfere(CHAVE, v, TOKEN, "9999"), false);
  assert.equal(cookieGarcomConfere(CHAVE, v, TOKEN, null), false);
  assert.equal(cookieGarcomConfere("outra-chave", v, TOKEN, "1234"), false);
  const outro = "ffffffffffffffff";
  assert.equal(cookieGarcomConfere(CHAVE, v.replace(TOKEN, outro), outro, "1234"), false);
});

test("sem chave no servidor não gera cookie", () => {
  assert.throws(() => montarCookieGarcom("", TOKEN, "1234"));
});
