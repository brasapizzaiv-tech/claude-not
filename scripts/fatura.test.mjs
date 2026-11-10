// Testes do leitor da fatura do cartão (src/lib/fatura.ts).
// Rode: node --test scripts/fatura.test.mjs
// Linhas copiadas das faturas reais, sem nome nem número de conta.
import { test } from "node:test";
import assert from "node:assert/strict";
import { lerFaturaTexto } from "../src/lib/fatura.ts";

test("Sicredi: pagamento fora, parcela no fim, exterior em 2 linhas", () => {
  const l = lerFaturaTexto([
    "Vencimento 13/08/2026",
    "13/jul 23:27 Pagamento 024314977 -R$ 9.263,68",
    "23/jun 23:43 Online Pg Malhas Ellis 02/06 R$ 363,00",
    "27/jul 08:31 Londrina Online Ll68gangclos R$ 19,90",
    "27/jun 07:45 Online Paypal Scienerbxc6 4029357733",
    "Hk BRL 48,96 = US$ 0,00 R$ 0,00 R$ 48,96",
  ].join("\n"));
  assert.deepEqual(l.compras.map((c) => [c.descricao, c.parcela, c.valor]), [
    ["Pg Malhas Ellis", "02/06", 363],
    ["Ll68gangclos", null, 19.9],
    ["Paypal Scienerbxc6 4029357733 Hk", null, 48.96],
  ]);
  assert.equal(l.vencimento, "2026-08-13");
});

test("Sicoob: valor sem R$, cidade terminando em r, parcela no meio, total da fatura", () => {
  const l = lerFaturaTexto([
    "Fatura de OUTUBRO Vencimento: 07/10/2026",
    "- SALDO ANTERIOR 3.861,33",
    "25/02 ANUIDADE MASTERCARD (8063) 07/12 18,75",
    "25/02 DESC ANUIDADE POR USO MAS -18,75",
    "08/09 PAGAMENTO DEBITO EM CONTA -3.861,33",
    "09/09 PROTEÇÃO PERDA OU ROUBO 3,20",
    "18/09 IOF OPERACAO EXTERIOR 4,16",
    "31/01 PAV 08/12 Rio de Janeir 3.750,00",
    "17/09 SupermercadosKern IVOTI 8,99",
    "18/09 VERCEL INC.V COVINA",
    "US$ 23,04 U$ 23,04 V.DOL 5,1575 118,83",
    "TOTAL 3.877,82",
    "MULTA 2,00",
    "Total da fatura 3.885,18",
  ].join("\n"));
  const pav = l.compras.find((c) => c.descricao.startsWith("PAV"));
  assert.equal(pav.valor, 3750);
  assert.equal(pav.parcela, "08/12");
  assert.ok(l.compras.some((c) => c.descricao === "IOF OPERACAO EXTERIOR" && c.valor === 4.16));
  assert.ok(l.compras.some((c) => c.descricao.startsWith("VERCEL") && c.valor === 118.83));
  assert.ok(!l.compras.some((c) => /PAGAMENTO/.test(c.descricao)));
  assert.equal(l.total, 3885.18);
  assert.equal(l.totalFatura, 3885.18);
  assert.equal(l.vencimento, "2026-10-07");
});
