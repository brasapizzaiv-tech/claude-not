// Testes da análise buffet livre × quilo (src/lib/buffet-analise-core.ts).
// Rode: node --test scripts/buffet-analise.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { analisarDias, somar, limiteQueda, segundaDe } from "../src/lib/buffet-analise-core.ts";

const perto = (a, b) => assert.ok(Math.abs(a - b) < 0.01, `${a} ≠ ${b}`);

// Segunda 26/10: quilo R$ 100, livre R$ 40 (teto em 400 g).
const DIA = "2026-10-26";
const pratos = [
  { dia: DIA, livre: false, peso: 0.3, valor: 30 },
  { dia: DIA, livre: false, peso: 0.5, valor: 50 },
  { dia: DIA, livre: true, peso: 0.6, valor: 40 },   // passou do teto: paga o livre
  { dia: DIA, livre: true, peso: 0.35, valor: 35 },  // abaixo do teto: paga o quilo
  { dia: DIA, livre: true, peso: 0, valor: 40 },     // apertou livre direto
];

test("preços do dia, livre direto estimado e só quilo", () => {
  const [d] = analisarDias(pratos);
  assert.equal(d.dow, 1);
  perto(d.precoKg, 100);
  perto(d.precoLivre, 40);
  assert.deepEqual([d.kg.pratos, d.livre.pratos, d.livre.pesou, d.livre.diretos], [2, 3, 2, 1]);
  perto(d.livre.peso, 0.95 + 0.475); // direto = média de quem pesou
  perto(d.livre.valor, 115);
  perto(d.soKg, 80 + 1.425 * 100);
});

test("livre mais caro: só quem passa do teto paga a mais", () => {
  const [d] = analisarDias(pratos);
  // +3: 600 g paga 43 (+3), 350 g segue 35, direto paga 43 (+3)
  perto(d.extra[3], 6);
  // +10: 600 g paga 50 (+10), direto 50 (+10)
  perto(d.extra[10], 20);
});

test("soma, limite de queda e semana", () => {
  const s = somar(analisarDias(pratos));
  perto(s.valor, 195);
  const livreNoQuilo = s.soKg - s.kgValor;
  perto(limiteQueda(s), (s.soKg - 195) / livreNoQuilo);
  assert.equal(segundaDe("2026-10-26"), "2026-10-26");
  assert.equal(segundaDe("2026-10-31"), "2026-10-26");
  assert.equal(segundaDe("2026-11-01"), "2026-10-26");
});

test("dia sem prato a quilo usa o preço do cadastro", () => {
  const [d] = analisarDias([{ dia: DIA, livre: true, peso: 0, valor: 40 }], () => ({ kg: 90, livre: 40 }));
  perto(d.precoKg, 90);
  perto(d.precoLivre, 40);
  perto(d.livre.peso, 0); // sem ninguém pesando o livre, não tem como estimar
});
