// Auditoria (Etapa 2) — só leitura. O banco bate com as migrations do repositório?
// 1) arquivos × public._migrations; 2) números repetidos; 3) tabelas, colunas e
// funções do banco que nenhuma migration cria (sinal de alteração feita na mão).
// Rode: node scripts/auditoria/migrations-x-banco.mjs
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { conectar } from "./db.mjs";

const PASTA = resolve(import.meta.dirname, "..", "..", "supabase", "migrations");
const arquivos = readdirSync(PASTA).filter((f) => f.endsWith(".sql")).sort();
const sql = arquivos.map((f) => readFileSync(join(PASTA, f), "utf8").toLowerCase()).join("\n");

const c = await conectar();
const aplicadas = new Set((await c.query("select nome from public._migrations")).rows.map((r) => r.nome));
const naoAplicadas = arquivos.filter((f) => !aplicadas.has(f));
const semArquivo = [...aplicadas].filter((n) => !arquivos.includes(n)).sort();
const porNumero = new Map();
for (const f of arquivos) { const n = f.slice(0, 4); porNumero.set(n, [...(porNumero.get(n) ?? []), f]); }
const repetidos = [...porNumero].filter(([, v]) => v.length > 1);

console.log(`Arquivos: ${arquivos.length} · registradas no banco: ${aplicadas.size}`);
console.log(`\n# Arquivos que o banco não registra como aplicados (${naoAplicadas.length}):`);
for (const f of naoAplicadas) console.log("-", f);
console.log(`\n# Registradas no banco sem arquivo no repositório (${semArquivo.length}):`);
for (const f of semArquivo) console.log("-", f);
console.log(`\n# Números repetidos (${repetidos.length}):`);
for (const [n, v] of repetidos) console.log("-", n, "→", v.join(" | "), "· aplicadas:", v.map((x) => (aplicadas.has(x) ? "sim" : "NÃO")).join("/"));

// Tabelas do schema public sem "create table" em nenhuma migration.
const tabelas = (await c.query(`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1`)).rows.map((r) => r.table_name);
const tabSem = tabelas.filter((t) => !new RegExp(`create table (if not exists )?(public\\.)?"?${t}"?[\\s(]`).test(sql));
console.log(`\n# Tabelas do banco sem create table nas migrations (${tabSem.length} de ${tabelas.length}):`);
for (const t of tabSem) console.log("-", t);

// Colunas sem menção na migration da tabela (nem create nem add column).
const cols = (await c.query(`select table_name, column_name from information_schema.columns where table_schema = 'public' and table_name = any($1) order by 1, ordinal_position`, [tabelas])).rows;
const colSem = cols.filter((r) => !tabSem.includes(r.table_name) && !new RegExp(`\\b${r.column_name}\\b`).test(sql));
console.log(`\n# Colunas que nenhuma migration menciona (${colSem.length}):`);
for (const r of colSem) console.log("-", `${r.table_name}.${r.column_name}`);

// Funções do schema public sem "function <nome>" nas migrations.
const funcs = (await c.query(`select distinct p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  left join pg_depend d on d.objid = p.oid and d.deptype = 'e'
  where n.nspname = 'public' and d.objid is null order by 1`)).rows.map((r) => r.proname);
const funcSem = funcs.filter((f) => !new RegExp(`function (public\\.)?"?${f}"?\\s*\\(`).test(sql));
console.log(`\n# Funções do banco sem create function nas migrations (${funcSem.length} de ${funcs.length}):`);
for (const f of funcSem) console.log("-", f);
await c.end();
