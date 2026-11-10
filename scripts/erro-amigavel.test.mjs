// Testes do erro em português (src/lib/erro-amigavel.ts, TXT-02).
// Rode: node --test scripts/erro-amigavel.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { explicarErro } from "../src/lib/erro-amigavel.ts";

const calar = () => { const o = console.error; console.error = () => {}; return () => { console.error = o; }; };

test("códigos do Postgres viram frase", () => {
  const volta = calar();
  assert.equal(explicarErro({ code: "23505", message: 'duplicate key value violates unique constraint "x"' }), "Já existe um cadastro com esses dados.");
  assert.match(explicarErro({ code: "23503", message: "violates foreign key" }), /ligado a outro cadastro/);
  assert.match(explicarErro({ code: "42501", message: "permission denied for table x" }), /Sem permissão/);
  assert.match(explicarErro({ code: "22P02", message: 'invalid input syntax for type uuid: ""' }), /formato/);
  volta();
});

test("mensagem nossa (em português) passa como veio", () => {
  assert.equal(explicarErro({ message: "Escolha o funcionário pra lançar a compra da equipe." }), "Escolha o funcionário pra lançar a compra da equipe.");
});

test("texto técnico sem código conhecido vira o genérico (ou o padrão)", () => {
  const volta = calar();
  assert.match(explicarErro({ message: 'column "x" does not exist' }), /Não consegui gravar/);
  assert.equal(explicarErro({ message: 'relation "y" does not exist' }, "Não salvou o cliente."), "Não salvou o cliente.");
  assert.match(explicarErro({ message: "TypeError: fetch failed" }), /Sem conexão/);
  volta();
});

test("sem erro: o padrão", () => {
  assert.equal(explicarErro(null, "Falha ao criar usuário."), "Falha ao criar usuário.");
});
