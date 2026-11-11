// Testes da cobrança do fornecedor (src/lib/conferencia-cobranca.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { linhasDeCobranca, textoDaCobranca, linkWhatsWeb } from "../src/lib/conferencia-cobranca.ts";

const un = (id) => ({ a: "kg", b: "un", c: "cx" })[id] ?? "";

test("sem nota: falta vale pelo preço cotado; veio a mais não vem marcado", () => {
  const ped = { id: "p1", data: "2026-11-05", temNota: false, itens: [
    { tipo: "faltou", produto: "Alcatra", produto_id: "a", pedido: 10, recebido: 0, preco_cotado: 40 },
    { tipo: "qtd_recebida", produto: "Ovo", produto_id: "b", pedido: 30, recebido: 24, preco_cotado: 0.5 },
    { tipo: "qtd_recebida", produto: "Ovo extra", produto_id: "b", pedido: 30, recebido: 36, preco_cotado: 0.5 },
    { tipo: "veio_a_mais", produto: "Queijo", produto_id: "a", pedido: 0, recebido: 2 },
  ] };
  const l = linhasDeCobranca([ped], un);
  assert.equal(l.length, 3); // "veio mais que o pedido" não é cobrança
  assert.deepEqual(l.map((x) => [x.tipo, x.valor, x.marcada]), [["faltou", 400, true], ["qtd_recebida", 3, true], ["veio_a_mais", null, false]]);
  const txt = textoDaCobranca({ empresa: "Casa", fornecedor: "Frigo", pedidos: [ped], linhas: l, escolhidas: new Set(l.filter((x) => x.marcada).map((x) => x.chave)), fecho: "Obrigado" });
  assert.match(txt, /\*Casa — conferência do pedido\*/);
  assert.match(txt, /Frigo · pedido de 05\/11/);
  assert.match(txt, /Alcatra: pedimos 10 kg, não veio — R\$\s?400,00/);
  assert.match(txt, /faltou 6 un/);
  assert.match(txt, /\*Total a acertar: R\$\s?403,00\*/);
  assert.ok(!txt.includes("Queijo"));
  assert.ok(txt.endsWith("Obrigado"));
});

test("com nota: falta é só aviso, o dinheiro vem do cobrado sem entregar e do preço", () => {
  const ped = { id: "p2", data: "2026-11-06", temNota: true, notaNumero: "123", itens: [
    { tipo: "qtd_recebida", produto: "Alcatra", produto_id: "a", pedido: 10, recebido: 8, preco_cotado: 40 },
    { tipo: "cobrado_nao_recebido", produto: "Alcatra", produto_id: "a", nota: 10, recebido: 8, preco_nota: 42, valor: 84 },
    { tipo: "preco_nota_acima", produto: "Alcatra", produto_id: "a", preco_cotado: 40, preco_nota: 42, nota: 10, valor: 20 },
    { tipo: "preco_nota_abaixo", produto: "Ovo", produto_id: "b", preco_cotado: 1, preco_nota: 0.9, nota: 30, valor: -3 },
    { tipo: "unidade_diferente", produto: "Luva", produto_id: "c", preco_cotado: 1, preco_nota: 30 },
    { tipo: "qtd_nota", produto: "Alcatra", produto_id: "a", pedido: 10, nota: 10 },
  ] };
  const l = linhasDeCobranca([ped], un);
  assert.deepEqual(l.map((x) => [x.tipo, x.valor]), [["qtd_recebida", null], ["cobrado_nao_recebido", 84], ["preco_nota_acima", 20]]);
  const txt = textoDaCobranca({ empresa: "Casa", fornecedor: "Frigo", pedidos: [ped], linhas: l, escolhidas: new Set(l.map((x) => x.chave)) });
  assert.match(txt, /pedido de 06\/11 \(nota 123\)/);
  assert.match(txt, /\*Total a acertar: R\$\s?104,00\*/);
});

test("vários pedidos: cada item diz de qual pedido é; desmarcado sai do texto e do total", () => {
  const a = { id: "p1", data: "2026-11-03", temNota: false, itens: [{ tipo: "faltou", produto: "Alcatra", produto_id: "a", pedido: 1, recebido: 0, preco_cotado: 40 }] };
  const b = { id: "p2", data: "2026-11-07", temNota: false, itens: [{ tipo: "faltou", produto: "Ovo", produto_id: "b", pedido: 2, recebido: 0, preco_cotado: 1 }] };
  const l = linhasDeCobranca([a, b], un);
  const tudo = textoDaCobranca({ empresa: "Casa", fornecedor: "F", pedidos: [a, b], linhas: l, escolhidas: new Set(l.map((x) => x.chave)) });
  assert.match(tudo, /conferência dos pedidos/);
  assert.match(tudo, /\[pedido 03\/11\]/);
  assert.match(tudo, /R\$\s?42,00/);
  const so = textoDaCobranca({ empresa: "Casa", fornecedor: "F", pedidos: [a, b], linhas: l, escolhidas: new Set([l[1].chave]) });
  assert.ok(!so.includes("Alcatra"));
  assert.match(so, /conferência do pedido\*/);
  assert.match(so, /R\$\s?2,00/);
});

test("link do WhatsApp Web", () => {
  assert.equal(linkWhatsWeb("(51) 99999-8888", "oi"), "https://web.whatsapp.com/send?phone=5551999998888&text=oi");
  assert.equal(linkWhatsWeb("5551999998888", "oi"), "https://web.whatsapp.com/send?phone=5551999998888&text=oi");
  assert.equal(linkWhatsWeb("55 99123-4567", "oi"), "https://web.whatsapp.com/send?phone=5555991234567&text=oi"); // DDD 55
  assert.equal(linkWhatsWeb(null, "a b"), "https://web.whatsapp.com/send?text=a%20b");
});
