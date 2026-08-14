// Importa um "Relatório de Contas a Pagar" (Excel-HTML) para os lançamentos,
// forçando a competência informada. Uso:
//   node scripts/importar-contas.mjs "<arquivo.xls>" 2026-06          (teste)
//   node scripts/importar-contas.mjs "<arquivo.xls>" 2026-06 --commit (grava)
import { readFileSync, writeFileSync } from "node:fs";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import pg from "pg";

const arquivo = process.argv[2];
const comp = process.argv[3]; // AAAA-MM
const COMMIT = process.argv.includes("--commit");
if (!arquivo || !/^\d{4}-\d{2}$/.test(comp || "")) {
  console.error('Uso: node scripts/importar-contas.mjs "<arquivo.xls>" AAAA-MM [--commit]');
  process.exit(1);
}
const ultimoDia = new Date(Number(comp.slice(0, 4)), Number(comp.slice(5, 7)), 0)
  .toISOString()
  .slice(0, 10);

const html = readFileSync(arquivo, "utf8");
const rows = [...html.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((m) => m[0]);
const cell = (tr) =>
  [...tr.matchAll(/<t[dh][\s\S]*?>([\s\S]*?)<\/t[dh]>/gi)].map((c) =>
    c[1].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim(),
  );
const norm = (s) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const stripCode = (s) => s.replace(/^\d+\.\d+\.\s*/, "").trim();
const parseVal = (s) => Number(String(s).replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", ".")) || 0;
const ddmm = (s) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((s || "").trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};
const isoDate = (s) => (/^\d{4}-\d{2}-\d{2}$/.test((s || "").trim()) ? s.trim() : ddmm(s));
const tituloForma = (s) => {
  const n = norm(s);
  if (n === "dinheiro") return "Dinheiro";
  if (n === "pix") return "Pix";
  if (!s) return null;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
};
const alias = {
  fruteira: "Hortifruti", frango: "Aves", "aguas refrigerantes sucos": "Águas e Refrigerantes",
  "material de limpeza": "Materiais de Limpeza", "gratificacoes e metas": "Outras despesas com pessoal",
  "diversos variaveis": "Outras administrativas", "gas para aquecedores": "Conta de Gás",
  "embalagens venda direta": "Embalagens", "salario free noite": "CMO Eventual / Diaristas",
  "salario free dia": "CMO Eventual / Diaristas", "salario garcom associacao": "Salários",
  "salario carteira": "Salários",
};

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

// Evita reimportar o mesmo mês sem querer.
const jaTem = (await c.query(
  `select count(*) n from lancamentos where origem='manual' and data>=$1 and data<= $2`,
  [`${comp}-01`, ultimoDia],
)).rows[0].n;
if (Number(jaTem) > 0)
  console.log(`⚠ Atenção: já existem ${jaTem} lançamentos manuais na competência ${comp}.`);

const dre = (await c.query("select id, nome from dre_categorias")).rows.map((d) => ({ id: d.id, n: norm(d.nome), nome: d.nome }));
const byNome = (nome) => dre.find((d) => d.n === norm(nome));
const fallback = byNome("Outras administrativas");
function catId(catRaw) {
  const first = stripCode((catRaw || "").split(",")[0]);
  const nf = norm(first);
  if (alias[nf]) { const t = byNome(alias[nf]); if (t) return t.id; }
  const m = dre.find((d) => d.n === nf) || dre.find((d) => d.n.includes(nf) || nf.includes(d.n));
  return (m || fallback)?.id ?? null;
}
function detectaBanco(desc) {
  for (const b of ["Sicredi", "Banrisul", "Sicoob"]) if (new RegExp(b, "i").test(desc)) return b;
  return null;
}

const data = rows.slice(1).map(cell).filter((r) => r.length >= 8 && r[4]);
const metodos = ["dinheiro", "pix", "cartao", "credito", "debito", "transferencia", "boleto", "cheque"];
let total = 0, aberto = 0, semCat = 0;
const regs = data.map((r) => {
  const valor = parseVal(r[4]);
  const pago = /pago/i.test(r[7]);
  const liq = isoDate(r[6]);
  const venc = isoDate(r[5]);
  const dt = pago && liq && liq.startsWith(comp) ? liq : venc && venc.startsWith(comp) ? venc : ultimoDia;
  const cid = catId(r[2]);
  if (!cid || cid === fallback?.id) semCat++;
  total += valor; if (!pago) aberto += valor;
  let desc = (r[1] || "").replace(/^Pagamento\s+/i, "").trim();
  let forma = null; const toks = desc.split(/\s+/); const last = toks[toks.length - 1];
  if (toks.length > 1 && metodos.includes(norm(last))) { forma = tituloForma(last); desc = toks.slice(0, -1).join(" ").trim(); }
  return {
    data: dt, lancamento_em: ddmm(r[0]), descricao: desc, valor, forma_pagamento: forma,
    banco: detectaBanco(desc), vencimento: venc, pago, pago_em: pago ? liq : null,
    categoria_id: cid, origem: "manual",
  };
});

console.log(COMMIT ? "=== GRAVANDO ===" : "=== TESTE (sem gravar) ===", "competência", comp);
console.log("Registros:", regs.length, "| Total R$", total.toFixed(2), "| Em aberto R$", aberto.toFixed(2));
console.log("Sem categoria específica:", semCat);
regs.slice(0, 5).forEach((r) =>
  console.log("  ", r.data, "|", r.descricao.slice(0, 30), "| R$", r.valor, "|", r.pago ? "PAGO" : "ABERTO", "| cat", dre.find((d) => d.id === r.categoria_id)?.nome, "| banco", r.banco ?? "-"),
);

if (COMMIT) {
  const ids = [];
  for (const r of regs) {
    const q = await c.query(
      `insert into lancamentos (data, lancamento_em, descricao, valor, forma_pagamento, banco, vencimento, pago, pago_em, categoria_id, origem)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'manual') returning id`,
      [r.data, r.lancamento_em, r.descricao, r.valor, r.forma_pagamento, r.banco, r.vencimento, r.pago, r.pago_em, r.categoria_id],
    );
    ids.push(q.rows[0].id);
  }
  writeFileSync(`scripts/_lote-${comp}-ids.json`, JSON.stringify(ids));
  console.log(`\n✅ Gravados ${ids.length}. IDs em scripts/_lote-${comp}-ids.json (para desfazer).`);
}
await c.end();
