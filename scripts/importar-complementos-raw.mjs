// Importa complementos do formato BRUTO do Suitable (com show_in e allow_repeat).
// - ativo da opção = show_in.pdv || show_in.waiter (oculto no Suitable entra desativado)
// - grupo.permite_repetir = allow_repeat
// Reimportável: apaga os grupos atuais de cada item antes de recriar.
// Uso: node scripts/importar-complementos-raw.mjs "<categoria.json>" [--commit]
import { readFileSync } from "node:fs";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import pg from "pg";

const file = process.argv[2];
const COMMIT = process.argv.includes("--commit");
if (!file) {
  console.error('Uso: node scripts/importar-complementos-raw.mjs "<categoria.json>" [--commit]');
  process.exit(1);
}
const cat = JSON.parse(readFileSync(file, "utf8"));
const categoria = (cat.name || "").trim();
const ativoDe = (si) =>
  !si || (si.pdv === undefined && si.waiter === undefined) ? true : !!(si.pdv || si.waiter);

console.log(COMMIT ? "=== GRAVANDO ===" : "=== TESTE (sem gravar) ===", "categoria:", categoria);
for (const p of cat.products || []) {
  const grupos = p.complements || [];
  let tot = 0, ativos = 0;
  for (const g of grupos) for (const it of g.items || []) { tot++; if (ativoDe(it.show_in)) ativos++; }
  console.log(`- ${p.name}: ${grupos.length} grupos, ${tot} opções (${ativos} ativas)`);
}

if (COMMIT) {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const semItem = [];
  for (const p of cat.products || []) {
    const r = await c.query(
      "select id from pdv_itens where lower(nome)=lower($1) and categoria=$2 limit 1",
      [(p.name || "").trim(), categoria],
    );
    if (r.rowCount === 0) { semItem.push(p.name); continue; }
    const itemId = r.rows[0].id;
    await c.query("delete from pdv_item_grupos where item_id=$1", [itemId]);
    const grupos = [...(p.complements || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
    let gOrdem = 0;
    for (const g of grupos) {
      const gr = await c.query(
        "insert into pdv_item_grupos (item_id,nome,min,max,permite_repetir,ordem) values ($1,$2,$3,$4,$5,$6) returning id",
        [itemId, g.name, g.min ?? 0, g.max ?? 1, !!g.allow_repeat, gOrdem++],
      );
      const grupoId = gr.rows[0].id;
      const items = [...(g.items || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
      let oOrdem = 0;
      for (const it of items) {
        await c.query(
          "insert into pdv_item_opcoes (grupo_id,nome,preco,ordem,ativo) values ($1,$2,$3,$4,$5)",
          [grupoId, it.name, Number(it.price) || 0, oOrdem++, ativoDe(it.show_in)],
        );
      }
    }
  }
  const n = await c.query("select count(*) t, count(*) filter (where ativo) a from pdv_item_opcoes");
  console.log(`\n✅ Opções no total: ${n.rows[0].t} (${n.rows[0].a} ativas)`);
  if (semItem.length) console.log("⚠ Não encontrados:", semItem.join(", "));
  await c.end();
}
