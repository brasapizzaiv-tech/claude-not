// Testes do dígito do CPF/CNPJ do consumidor (FIS-05, src/lib/fiscal/cnpj.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpfValido, docValido } from "../src/lib/fiscal/cnpj.ts";

test("CPF", () => {
  assert.equal(cpfValido("529.982.247-25"), true);
  assert.equal(cpfValido("52998224725"), true);
  assert.equal(cpfValido("529.982.247-24"), false);
  assert.equal(cpfValido("111.111.111-11"), false);
  assert.equal(cpfValido("1234567890"), false);
});

test("CPF ou CNPJ", () => {
  assert.equal(docValido("11.222.333/0001-81"), true);
  assert.equal(docValido("11.222.333/0001-80"), false);
  assert.equal(docValido("52998224725"), true);
  assert.equal(docValido("123"), false);
  assert.equal(docValido(""), false);
});
