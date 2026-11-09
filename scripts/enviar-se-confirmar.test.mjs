// Formulário que só envia depois de confirmar (src/lib/enviar-se-confirmar.ts, ACE-01).
// Rode: node --test scripts/enviar-se-confirmar.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { enviarSeConfirmar } from "../src/lib/enviar-se-confirmar.ts";

function montar() {
  const form = { isConnected: true, reenvios: [], requestSubmit(b) { this.reenvios.push(b); } };
  const evento = (submitter) => {
    const e = { currentTarget: form, nativeEvent: { submitter }, impedido: false, preventDefault() { this.impedido = true; } };
    return e;
  };
  return { form, evento };
}
const esperar = () => new Promise((r) => setTimeout(r, 0));

test("o envio é segurado NA HORA, antes de a pessoa responder", () => {
  const { evento } = montar();
  let responder;
  const h = enviarSeConfirmar(() => new Promise((r) => { responder = r; }));
  const e = evento();
  h(e);
  assert.equal(e.impedido, true, "sem isso o React dispara a ação com a pergunta aberta");
  responder(false);
});

test("Voltar: nada é enviado", async () => {
  const { form, evento } = montar();
  enviarSeConfirmar(async () => false)(evento());
  await esperar();
  assert.equal(form.reenvios.length, 0);
});

test("Confirmar: reenvia uma vez, e o reenvio passa direto (não pergunta de novo)", async () => {
  const { form, evento } = montar();
  let perguntas = 0;
  const h = enviarSeConfirmar(async () => { perguntas++; return true; });
  h(evento());
  await esperar();
  assert.equal(form.reenvios.length, 1);
  const segundo = evento();
  h(segundo);
  assert.equal(segundo.impedido, false, "o segundo envio é o de verdade");
  assert.equal(perguntas, 1);
  const terceiro = evento();
  h(terceiro);
  assert.equal(terceiro.impedido, true, "um clique novo depois pergunta de novo");
});

test("reenvia com o mesmo botão que foi clicado (quando é do formulário)", async () => {
  const { form, evento } = montar();
  const botao = { form };
  enviarSeConfirmar(() => true)(evento(botao));
  await esperar();
  assert.equal(form.reenvios[0], botao);
});

test("se a tela já saiu (form fora da página), não reenvia", async () => {
  const { form, evento } = montar();
  form.isConnected = false;
  enviarSeConfirmar(async () => true)(evento());
  await esperar();
  assert.equal(form.reenvios.length, 0);
});
