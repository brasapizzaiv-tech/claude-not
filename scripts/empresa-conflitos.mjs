// Todo `upsert` do código diz ao banco por qual coluna ele reconhece a linha
// ("onConflict"). Se essa combinação não for mais única no banco, o upsert
// quebra na hora — e só na hora, porque nada disso o compilador enxerga.
//
// Trocar chaves por causa do multiempresa é exatamente o que desalinha os
// dois lados. Este script confere um contra o outro.
import pg from "pg";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
dotenv.config({ path: ".env.local" });

const base = "C:/Users/NeoTech/claude not/";
const arqs = [];
(function anda(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) anda(p);
    else if (/\.tsx?$/.test(e.name)) arqs.push(p);
  }
})(base + "src");

const c = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

// Todas as combinações únicas que existem hoje no banco.
const { rows } = await c.query(`
  select t.relname tabela,
         to_json(array_agg(a.attname order by a.attname)) cols
    from pg_index ix
    join pg_class t on t.oid = ix.indrelid
    join pg_attribute a on a.attrelid = t.oid and a.attnum = any(ix.indkey)
   where ix.indisunique and t.relnamespace = 'public'::regnamespace
   group by t.relname, ix.indexrelid`);
const unicos = new Map();
for (const r of rows) {
  const l = unicos.get(r.tabela) ?? [];
  l.push(r.cols.slice().sort().join(","));
  unicos.set(r.tabela, l);
}

let problemas = 0, conferidos = 0;
for (const p of arqs) {
  const s = fs.readFileSync(p, "utf8");
  const rel = p.split(path.sep).join("/").replace(base, "");
  // .from("tabela") ... onConflict: "a,b" — na MESMA cadeia de chamadas.
  // O trecho `(?:(?!\.from\()[\s\S])` impede o casamento de atravessar um
  // `.from()` seguinte e atribuir o onConflict à tabela errada: na primeira
  // versão deste script, 8 dos 11 avisos eram desse engano meu.
  const re = /\.from\(\s*"([a-z_]+)"\s*\)(?:(?!\.from\()[\s\S]){0,600}?onConflict:\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(s))) {
    const [, tabela, campos] = m;
    conferidos++;
    const alvo = campos.split(",").map((x) => x.trim()).sort().join(",");
    const temNoBanco = (unicos.get(tabela) ?? []).includes(alvo);
    const linha = s.slice(0, m.index).split("\n").length;
    if (!temNoBanco) {
      problemas++;
      console.log(`❌ ${rel}:${linha}`);
      console.log(`   upsert em "${tabela}" reconhece por (${campos})`);
      console.log(`   mas o banco só tem: ${(unicos.get(tabela) ?? ["nenhuma"]).map((u) => `(${u})`).join(" ")}`);
    }
  }
}

console.log(`\nupserts com onConflict conferidos: ${conferidos} · desalinhados: ${problemas}`);
if (problemas) process.exitCode = 1;
await c.end();
