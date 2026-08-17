// Importa complementos (grupos + opções) para itens já existentes em pdv_itens.
// Formato: { categoria, itens:[ { nome, grupos:[ { nome, min, max, opcoes:[{n,p}] } ] } ] }
// Reimportável: apaga os grupos atuais do item antes de recriar.
// Uso: node scripts/importar-complementos.mjs "<arquivo.json>" [--commit]
import { readFileSync } from "node:fs";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import pg from "pg";

const file = process.argv[2];
const COMMIT = process.argv.includes("--commit");
if (!file) {
  console.error('Uso: node scripts/importar-complementos.mjs "<arquivo.json>" [--commit]');
  process.exit(1);
}
const dados = JSON.parse(readFileSync(file, "utf8"));
const categoria = dados.categoria;

console.log(COMMIT ? "=== GRAVANDO ===" : "=== TESTE (sem gravar) ===");
for (const it of dados.itens) {
  const nGrupos = it.grupos.length;
  const nOpc = it.grupos.reduce((s, g) => s + g.opcoes.length, 0);
  console.log(`- ${it.nome}: ${nGrupos} grupos, ${nOpc} opções`);
}

if (COMMIT) {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  let okItens = 0;
  const semItem = [];
  for (const it of dados.itens) {
    const r = await c.query(
      "select id from pdv_itens where lower(nome)=lower($1) and categoria=$2 limit 1",
      [it.nome, categoria],
    );
    if (r.rowCount === 0) {
      semItem.push(it.nome);
      continue;
    }
    const itemId = r.rows[0].id;
    await c.query("delete from pdv_item_grupos where item_id=$1", [itemId]);
    let gOrdem = 0;
    for (const g of it.grupos) {
      const gr = await c.query(
        "insert into pdv_item_grupos (item_id,nome,min,max,ordem) values ($1,$2,$3,$4,$5) returning id",
        [itemId, g.nome, g.min ?? 0, g.max ?? 1, gOrdem++],
      );
      const grupoId = gr.rows[0].id;
      let oOrdem = 0;
      for (const o of g.opcoes) {
        await c.query(
          "insert into pdv_item_opcoes (grupo_id,nome,preco,ordem) values ($1,$2,$3,$4)",
          [grupoId, o.n, Number(o.p) || 0, oOrdem++],
        );
      }
    }
    okItens++;
  }
  console.log(`\n✅ Itens com complementos: ${okItens}`);
  if (semItem.length) console.log("⚠ Não encontrados em pdv_itens:", semItem.join(", "));
  await c.end();
}
