// Importa as pizzas do Suitable (tamanhos, sabores e bordas com preço por
// tamanho) para as tabelas pdv_pizza_*.
// Uso: node scripts/importar-pizzas.mjs "<arquivo.txt>" [--commit]
import { readFileSync } from "node:fs";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import pg from "pg";

const file = process.argv[2];
const COMMIT = process.argv.includes("--commit");
if (!file) {
  console.error('Uso: node scripts/importar-pizzas.mjs "<arquivo>" [--commit]');
  process.exit(1);
}
const cat = JSON.parse(readFileSync(file, "utf8"));

const tamanhos = (cat.pizza_sizes || []).map((s) => ({
  nome: s.name,
  max_sabores: s.max_flavors || 1,
  ordem: s.ordering || 0,
}));
const grupo = (nome) => (cat.pizza_groups || []).find((g) => g.name === nome);
const itensDe = (nomeGrupo) =>
  (grupo(nomeGrupo)?.group_items || []).map((it) => ({
    nome: it.name,
    ordem: it.ordering || 0,
    precos: (it.items_sizes || []).map((s) => ({ tamanho: s.name, preco: Number(s.price) || 0 })),
  }));
const sabores = itensDe("Sabores");
const bordas = itensDe("Bordas");

console.log(COMMIT ? "=== GRAVANDO ===" : "=== TESTE (sem gravar) ===");
console.log("Tamanhos:", tamanhos.map((t) => `${t.nome}(máx ${t.max_sabores})`).join(", "));
console.log("Sabores:", sabores.length, "| Bordas:", bordas.length);
console.log("Amostra sabor:", JSON.stringify(sabores[0]));

if (COMMIT) {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  // limpa e reimporta
  await c.query("delete from pdv_pizza_sabor_precos");
  await c.query("delete from pdv_pizza_borda_precos");
  await c.query("delete from pdv_pizza_sabores");
  await c.query("delete from pdv_pizza_bordas");
  await c.query("delete from pdv_pizza_tamanhos");

  const tamId = {};
  for (const t of tamanhos) {
    const r = await c.query(
      "insert into pdv_pizza_tamanhos (nome,max_sabores,ordem) values ($1,$2,$3) returning id",
      [t.nome, t.max_sabores, t.ordem],
    );
    tamId[t.nome] = r.rows[0].id;
  }
  const gravar = async (tabela, precoTabela, fk, lista) => {
    for (const it of lista) {
      const r = await c.query(
        `insert into ${tabela} (nome,ordem) values ($1,$2) returning id`,
        [it.nome, it.ordem],
      );
      const id = r.rows[0].id;
      for (const p of it.precos) {
        const tid = tamId[p.tamanho];
        if (!tid) continue;
        await c.query(
          `insert into ${precoTabela} (${fk},tamanho_id,preco) values ($1,$2,$3)`,
          [id, tid, p.preco],
        );
      }
    }
  };
  await gravar("pdv_pizza_sabores", "pdv_pizza_sabor_precos", "sabor_id", sabores);
  await gravar("pdv_pizza_bordas", "pdv_pizza_borda_precos", "borda_id", bordas);

  console.log("\n✅ Gravado:",
    (await c.query("select count(*) n from pdv_pizza_tamanhos")).rows[0].n, "tamanhos,",
    (await c.query("select count(*) n from pdv_pizza_sabores")).rows[0].n, "sabores,",
    (await c.query("select count(*) n from pdv_pizza_bordas")).rows[0].n, "bordas.");
  await c.end();
}
