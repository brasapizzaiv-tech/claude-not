// Leitura da página pública da NFC-e (src/lib/nfce-consulta-parse.ts).
// Página real: cupom do Supermercados Kern de 07/11/2026 (consumidor não
// identificado; sem dado pessoal). Rode: node --test scripts/nfce-consulta.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { lerPaginaNfce, chaveDoTexto } from "../src/lib/nfce-consulta-parse.ts";

const html = readFileSync(new URL("./fixtures/nfce-kern-2026-11-07.html", import.meta.url), "utf8");
const c = lerPaginaNfce(html);

test("emitente, número, série, emissão e chave", () => {
  assert.equal(c.emit_nome, "SUPERMERCADOS KERN LTDA");
  assert.equal(c.emit_cnpj, "48810660000164");
  assert.equal(c.numero, "278185");
  assert.equal(c.serie, "206");
  assert.equal(c.modelo, "65");
  assert.equal(c.data_emissao, "2026-11-07");
  assert.equal(c.chave, "43261148810660000164652060002781851708378333");
});

test("itens com quantidade, unidade e valores", () => {
  assert.equal(c.itens.length, 8);
  const leite = c.itens[0];
  assert.equal(leite.descricao, "LEITE ELEGE 1L LV GF INTEG");
  assert.equal(leite.cprod, "89030");
  assert.equal(leite.qtd, 48);
  assert.equal(leite.unidade, "UN");
  const choco = c.itens[2];
  assert.equal(choco.unidade, "KG");
  assert.equal(choco.qtd, 0.382);
});

test("total pago, desconto repartido e forma de pagamento", () => {
  assert.equal(c.valor, 248.31);
  assert.equal(c.desconto, 0.4);
  const soma = Math.round(c.itens.reduce((s, i) => s + i.valor_total, 0) * 100) / 100;
  assert.equal(soma, 248.31);
  assert.deepEqual(c.pagamentos, [{ forma: "Cartão de Débito", valor: 248.31 }]);
});

test("chave a partir do endereço do QR ou dos números digitados", () => {
  const url = "https://www.sefaz.rs.gov.br/NFCE/NFCE-COM.aspx?p=43261148810660000164652060002781851708378333|2|1|1|19EF72D4F2D5C7E33833AA49C62C25530534FE1F";
  assert.equal(chaveDoTexto(url), "43261148810660000164652060002781851708378333");
  assert.equal(chaveDoTexto("4326 1148 8106 6000 0164 6520 6000 2781 8517 0837 8333"), "43261148810660000164652060002781851708378333");
  assert.equal(chaveDoTexto("qualquer coisa"), "");
});
