// Testes da busca de cliente pelo telefone (src/lib/telefone.ts, DEL-05).
import { test } from "node:test";
import assert from "node:assert/strict";
import { foneDigitos, foneCandidatos } from "../src/lib/telefone.ts";

test("tira formatação e o 55 do país", () => {
  assert.equal(foneDigitos("(51) 99999-8888"), "51999998888");
  assert.equal(foneDigitos("+55 51 99999-8888"), "51999998888");
  assert.equal(foneDigitos("555199998888"), "5199998888");
});

test("candidatos: com e sem o 9 do celular; fixo não ganha 9", () => {
  assert.deepEqual(foneCandidatos("(51) 99999-8888").sort(), ["5199998888", "51999998888"].sort());
  assert.deepEqual(foneCandidatos("51 9999-8888").sort(), ["5199998888", "51999998888"].sort());
  assert.deepEqual(foneCandidatos("51 3563-1234"), ["5135631234"]);
  assert.deepEqual(foneCandidatos("9999-8888"), []); // sem DDD não busca
});
