// Importa o cardápio exportado do Suitable (JSON) para pdv_itens.
// Uso:
//   node scripts/importar-cardapio-suitable.mjs "<arquivo.json>"           (teste)
//   node scripts/importar-cardapio-suitable.mjs "<arquivo.json>" --commit  (grava)
import { readFileSync } from "node:fs";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import pg from "pg";

const file = process.argv[2];
const COMMIT = process.argv.includes("--commit");
if (!file) {
  console.error('Uso: node scripts/importar-cardapio-suitable.mjs "<arquivo.json>" [--commit]');
  process.exit(1);
}

const raw = JSON.parse(readFileSync(file, "utf8"));
// Aceita: array de categorias, {categories:[...]}, ou uma categoria só.
let cats = [];
if (Array.isArray(raw)) cats = raw;
else if (Array.isArray(raw.categories)) cats = raw.categories;
else if (Array.isArray(raw.products)) cats = [raw];
else cats = [raw];

const produtos = [];
for (const cat of cats) {
  const catNome = (cat?.name || "").trim();
  for (const p of cat?.products || []) {
    const nome = (p?.name || "").trim();
    if (!nome) continue;
    produtos.push({
      nome,
      categoria: (p?.category || catNome || "").trim() || null,
      preco: Number(p?.price) || 0,
    });
  }
}

console.log(COMMIT ? "=== GRAVANDO ===" : "=== TESTE (sem gravar) ===");
console.log("Categorias:", cats.length, "| Produtos:", produtos.length);
const porCat = {};
for (const p of produtos) porCat[p.categoria || "—"] = (porCat[p.categoria || "—"] || 0) + 1;
console.log("Por categoria:", JSON.stringify(porCat, null, 1));
console.log("Amostra:", JSON.stringify(produtos.slice(0, 6), null, 1));

if (COMMIT) {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  let n = 0;
  for (const p of produtos) {
    await c.query(`insert into pdv_itens (nome, categoria, preco) values ($1,$2,$3)`, [p.nome, p.categoria, p.preco]);
    n++;
  }
  console.log(`\n✅ Gravados ${n} itens no cardápio.`);
  await c.end();
}
