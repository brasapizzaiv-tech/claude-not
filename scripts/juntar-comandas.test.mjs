// Testes de juntar comandas no caixa (src/lib/juntar-comandas.ts), com um banco de
// mentira: nada vai ao banco de verdade.
// Rode: node --test scripts/juntar-comandas.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { aplicarJuntar, buffetJuntado, lerParaJuntar, podeSomar } from "../src/lib/juntar-comandas.ts";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const C = "00000000-0000-4000-8000-00000000000c";

const preco = {
  livreHoje: 46.9,
  calcular: (peso, soKg) => {
    const valor = Math.round(peso * 99.9 * 100) / 100;
    return !soKg && valor >= 46.9 ? { valor: 46.9, livre: true } : { valor, livre: false };
  },
};
const com = (id, numero, peso, valor, extra = {}) => ({ id, numero, mesa: "Balança", peso, tara: 0, valor, livre: false, soKg: false, clienteId: null, ...extra });

// Guarda cada escrita, na ordem, e aplica filtros simples.
function bancoFalso(tabelas = {}) {
  const log = [];
  const db = {
    from(tabela) {
      const e = { tabela, op: "select", filtros: [], valores: null };
      const q = {
        select() { if (e.op === "select") e.op = "select"; return q; },
        update(v) { e.op = "update"; e.valores = v; return q; },
        delete() { e.op = "delete"; return q; },
        insert(v) { e.op = "insert"; e.valores = v; return q; },
        eq(k, v) { e.filtros.push([k, [v]]); return q; },
        in(k, v) { e.filtros.push([k, v]); return q; },
        then(ok) {
          const linhas = tabelas[tabela] ?? [];
          const casa = (l) => e.filtros.every(([k, v]) => v.includes(l[k]));
          let data = null;
          if (e.op === "select") data = linhas.filter(casa);
          if (e.op === "update") { data = linhas.filter(casa); data.forEach((l) => Object.assign(l, e.valores)); }
          if (e.op === "delete") { data = linhas.filter(casa); tabelas[tabela] = linhas.filter((l) => !casa(l)); }
          if (e.op !== "select") log.push({ tabela, op: e.op, valores: e.valores, n: data?.length ?? 0 });
          const erro = tabelas.erros?.[`${tabela}:${e.op}`] ?? null;
          return Promise.resolve({ data: erro ? null : data, error: erro }).then(ok);
        },
      };
      return q;
    },
  };
  return { db, log, tabelas };
}

const linhaBanco = (id, numero, extra = {}) => ({ id, numero, mesa: "Balança", status: "aberta", peso: 0.3, tara: 0, valor_buffet: 30, livre: false, so_kg: false, cliente_id: null, buffet_pago: false, buffet_valor_pago: 0, buffet_base_pago: 0, ...extra });
const tabelasBase = () => ({
  pdv_comandas: [linhaBanco(B, 394), linhaBanco(A, 393), linhaBanco(C, 395)],
  pdv_comanda_itens: [],
  pdv_caixa_mov: [],
  delivery_pedidos: [],
  pdv_comandas_excluidas: [],
});

test("fica a comanda de menor número", async () => {
  const r = await lerParaJuntar(bancoFalso(tabelasBase()).db, [C, B, A]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.comandas.map((c) => c.numero), [393, 394, 395]);
});

test("precisa de 2 ou mais comandas diferentes", async () => {
  const { db } = bancoFalso(tabelasBase());
  assert.equal((await lerParaJuntar(db, [A])).ok, false);
  assert.equal((await lerParaJuntar(db, [A, A])).ok, false);
});

test("não junta comanda fechada", async () => {
  const t = tabelasBase();
  t.pdv_comandas[0].status = "fechada";
  const r = await lerParaJuntar(bancoFalso(t).db, [A, B]);
  assert.equal(r.ok, false);
  assert.match(r.mensagem, /#394/);
});

test("não junta comanda com qualquer pagamento", async () => {
  for (const mudar of [
    (t) => { t.pdv_comandas[0].buffet_pago = true; },
    (t) => { t.pdv_comandas[0].buffet_valor_pago = 10; },
    (t) => { t.pdv_comandas[0].buffet_base_pago = 10; },
    (t) => { t.pdv_comanda_itens.push({ comanda_id: B, pago: true, valor_pago: 8, base_pago: 8 }); },
    (t) => { t.pdv_comanda_itens.push({ comanda_id: B, pago: false, valor_pago: 4, base_pago: 4 }); },
    (t) => { t.pdv_caixa_mov.push({ comanda_id: B, tipo: "venda" }); },
  ]) {
    const t = tabelasBase();
    mudar(t);
    const r = await lerParaJuntar(bancoFalso(t).db, [A, B]);
    assert.equal(r.ok, false);
    assert.match(r.mensagem, /#394.*pagamento/);
  }
});

test("não junta comanda de delivery", async () => {
  const t = tabelasBase();
  t.delivery_pedidos.push({ comanda_id: A });
  const r = await lerParaJuntar(bancoFalso(t).db, [A, B]);
  assert.equal(r.ok, false);
  assert.match(r.mensagem, /delivery/);
});

test("erro ao ler não libera a junção", async () => {
  const t = tabelasBase();
  t.erros = { "pdv_comanda_itens:select": { message: "x" } };
  assert.equal((await lerParaJuntar(bancoFalso(t).db, [A, B])).ok, false);
});

test("livre cobra um só, nunca a soma", () => {
  const r = buffetJuntado([com(A, 393, 0.15, 14.99), com(B, 394, 0.15, 14.99), com(C, 395, 0, 46.9, { livre: true })], { tipo: "livre" }, preco);
  assert.equal(r.campos.valor_buffet, 46.9);
  assert.equal(r.campos.livre, true);
  assert.equal(r.campos.peso, 0.15);
});

test("livre sem preço do dia recusa", () => {
  assert.equal(buffetJuntado([com(A, 1, 0.1, 10), com(B, 2, 0.1, 10)], { tipo: "livre" }, { ...preco, livreHoje: 0 }).ok, false);
});

test("somar usa os pesos e respeita o teto", () => {
  const baixo = buffetJuntado([com(A, 1, 0.1, 9.99), com(B, 2, 0.2, 19.98)], { tipo: "somar" }, preco);
  assert.equal(baixo.campos.peso, 0.3);
  assert.equal(baixo.campos.valor_buffet, 29.97);
  assert.equal(baixo.campos.livre, false);
  const alto = buffetJuntado([com(A, 1, 0.3, 29.97), com(B, 2, 0.3, 29.97)], { tipo: "somar" }, preco);
  assert.equal(alto.campos.valor_buffet, 46.9);
  assert.equal(alto.campos.livre, true);
});

test("marmita somada continua só por kg", () => {
  const r = buffetJuntado([com(A, 1, 0.5, 49.95, { soKg: true }), com(B, 2, 0.5, 49.95)], { tipo: "somar" }, preco);
  assert.equal(r.campos.valor_buffet, 99.9);
  assert.equal(r.campos.so_kg, true);
});

test("não soma comanda livre sem peso", () => {
  const lista = [com(A, 1, 0.3, 29.97), com(B, 2, 0, 46.9, { livre: true })];
  assert.equal(podeSomar(lista), false);
  assert.equal(buffetJuntado(lista, { tipo: "somar" }, preco).ok, false);
});

test("manter usa o valor da comanda escolhida, mesmo não sendo a principal", () => {
  const r = buffetJuntado([com(A, 1, 0.1, 9.99), com(B, 2, 0.4, 39.96)], { tipo: "manter", id: B }, preco);
  assert.equal(r.campos.valor_buffet, 39.96);
  assert.equal(r.campos.peso, 0.4);
  assert.equal(buffetJuntado([com(A, 1, 0.1, 9.99), com(B, 2, 0.4, 39.96)], { tipo: "manter", id: C }, preco).ok, false);
});

function cenario() {
  const t = tabelasBase();
  t.pdv_comanda_itens = [{ id: "i1", comanda_id: B }, { id: "i2", comanda_id: C }];
  const comandas = [com(A, 393, 0.3, 30), com(B, 394, 0.3, 30), com(C, 395, 0.3, 30)];
  return { t, comandas };
}

test("move os itens antes de apagar, e registra quem saiu", async () => {
  const { t, comandas } = cenario();
  const { db, log, tabelas } = bancoFalso(t);
  const r = await aplicarJuntar(db, comandas, { tipo: "livre" }, preco, "usuario");
  assert.equal(r.ok, true);
  assert.equal(r.numero, 393);
  assert.equal(r.valor, 46.9);
  assert.deepEqual(tabelas.pdv_comanda_itens.map((i) => i.comanda_id), [A, A]);
  assert.deepEqual(tabelas.pdv_comandas.map((c) => c.id), [A]);
  assert.equal(tabelas.pdv_comandas[0].valor_buffet, 46.9);
  const ordem = log.map((l) => `${l.tabela}:${l.op}`);
  assert.ok(ordem.indexOf("pdv_comanda_itens:update") < ordem.indexOf("pdv_comandas:delete"));
  const reg = log.find((l) => l.tabela === "pdv_comandas_excluidas").valores;
  assert.deepEqual(reg.map((x) => x.comanda_numero), [394, 395]);
  assert.equal(reg[0].motivo, "Juntada na comanda #393");
  assert.equal(reg[0].excluido_por, "usuario");
});

test("se os itens não moverem, nada é apagado", async () => {
  const { t, comandas } = cenario();
  t.erros = { "pdv_comanda_itens:update": { message: "x" } };
  const { db, log } = bancoFalso(t);
  const r = await aplicarJuntar(db, comandas, { tipo: "livre" }, preco, null);
  assert.equal(r.ok, false);
  assert.equal(log.some((l) => l.op === "delete"), false);
});

test("se sobrar item nas outras, nada é apagado", async () => {
  const { t, comandas } = cenario();
  const { db, log } = bancoFalso(t);
  const original = db.from.bind(db);
  // A conferência depois de mover ainda enxerga um item na outra comanda.
  db.from = (tabela) => {
    const q = original(tabela);
    if (tabela !== "pdv_comanda_itens") return q;
    const select = q.select;
    q.select = () => { select(); t.pdv_comanda_itens.push({ id: "novo", comanda_id: B }); return q; };
    return q;
  };
  const r = await aplicarJuntar(db, comandas, { tipo: "livre" }, preco, null);
  assert.equal(r.ok, false);
  assert.equal(log.some((l) => l.op === "delete"), false);
});

test("principal que mudou não apaga as outras", async () => {
  const { t, comandas } = cenario();
  t.pdv_comandas.find((c) => c.id === A).buffet_pago = true;
  const { db, log } = bancoFalso(t);
  const r = await aplicarJuntar(db, comandas, { tipo: "livre" }, preco, null);
  assert.equal(r.ok, false);
  assert.equal(log.some((l) => l.op === "delete"), false);
});

test("comanda que outro caixa recebeu no meio fica de fora e avisa", async () => {
  const { t, comandas } = cenario();
  t.pdv_comandas.find((c) => c.id === C).buffet_pago = true;
  const { db, log, tabelas } = bancoFalso(t);
  const r = await aplicarJuntar(db, comandas, { tipo: "livre" }, preco, null);
  assert.equal(r.ok, false);
  assert.match(r.mensagem, /#395/);
  assert.ok(tabelas.pdv_comandas.some((c) => c.id === C));
  assert.deepEqual(log.find((l) => l.tabela === "pdv_comandas_excluidas").valores.map((x) => x.comanda_numero), [394]);
});

test("o cliente vinculado a uma delas passa para a principal", async () => {
  const { t } = cenario();
  const { db, tabelas } = bancoFalso(t);
  await aplicarJuntar(db, [com(A, 393, 0.3, 30), com(B, 394, 0.3, 30, { clienteId: "cli" })], { tipo: "livre" }, preco, null);
  assert.equal(tabelas.pdv_comandas.find((c) => c.id === A).cliente_id, "cli");
});
