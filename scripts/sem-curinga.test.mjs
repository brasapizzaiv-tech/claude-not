// Testes do texto exato no .ilike (SEC-19, src/lib/format.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { semCuringa } from "../src/lib/format.ts";

const B = String.fromCharCode(92); // a barra invertida

test("escapa % e _ e a barra", () => {
  assert.equal(semCuringa("%"), B + "%");
  assert.equal(semCuringa("BRASA_10"), "BRASA" + B + "_10");
  assert.equal(semCuringa("a" + B + "b"), "a" + B + B + "b");
  assert.equal(semCuringa("Joao"), "Joao");
});
