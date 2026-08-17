// Importa uma categoria do Suitable (formato completo, com show_in/price) para
// pdv_itens + garante a linha em pdv_categorias.
// - ativo = show_in.waiter || show_in.pdv (produto escondido em tudo entra oculto)
// - não duplica: pula item com mesmo nome (case-insensitive) na mesma categoria
// Uso: node scripts/importar-categoria.mjs "<arquivo.json>" [--commit]
import { readFileSync } from "node:fs";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import pg from "pg";

const file = process.argv[2];
const COMMIT = process.argv.includes("--commit");
if (!file) {
  console.error('Uso: node scripts/importar-categoria.mjs "<arquivo.json>" [--commit]');
  process.exit(1);
}
const cat = JSON.parse(readFileSync(file, "utf8"));
const categoria = (cat.name || "").trim();
const produtos = (cat.products || []).map((p) => {
  const si = p.show_in || {};
  const ativo = si.waiter === undefined && si.pdv === undefined ? true : !!(si.waiter || si.pdv);
  return { nome: (p.name || "").trim(), preco: Number(p.price) || 0, ativo };
});

console.log(COMMIT ? "=== GRAVANDO ===" : "=== TESTE (sem gravar) ===");
console.log("Categoria:", categoria, "| Produtos:", produtos.length);
console.log("Ocultos:", produtos.filter((p) => !p.ativo).map((p) => p.nome).join(", ") || "nenhum");

if (COMMIT) {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  // garante categoria
  const ex = await c.query("select id from pdv_categorias where nome=$1", [categoria]);
  if (ex.rowCount === 0) {
    const mx = await c.query("select coalesce(max(ordem),0)+1 o from pdv_categorias");
    await c.query("insert into pdv_categorias (nome, ordem) values ($1,$2)", [categoria, mx.rows[0].o]);
  }

  let inseridos = 0;
  let pulados = 0;
  for (const p of produtos) {
    if (!p.nome) continue;
    const dup = await c.query(
      "select 1 from pdv_itens where lower(nome)=lower($1) and categoria=$2 limit 1",
      [p.nome, categoria],
    );
    if (dup.rowCount) {
      pulados++;
      continue;
    }
    await c.query(
      "insert into pdv_itens (nome, categoria, preco, ativo) values ($1,$2,$3,$4)",
      [p.nome, categoria, p.preco, p.ativo],
    );
    inseridos++;
  }
  const tot = await c.query("select count(*) n from pdv_itens where categoria=$1", [categoria]);
  console.log(`\n✅ Inseridos: ${inseridos} | Já existiam (pulados): ${pulados} | Total em "${categoria}": ${tot.rows[0].n}`);
  await c.end();
}
