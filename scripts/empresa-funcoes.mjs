// As funções RPC passam por cima das regras (security definer). Quais delas
// varrem uma tabela inteira em vez de partir de um token?
import pg from "pg";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const alvo = process.argv.slice(2);
const c = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

const { rows } = await c.query(`
  select p.proname nome, p.prosecdef definidor, pg_get_function_arguments(p.oid) args,
         p.prosrc corpo
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
   order by p.proname
`);

const lista = alvo.length ? rows.filter((r) => alvo.includes(r.nome)) : rows;
for (const r of lista) {
  const tabelas = [...new Set((r.corpo.match(/\b(?:from|join|update|into)\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi) || [])
    .map((m) => m.split(/\s+/).pop().replace("public.", "")))];
  console.log(`\n### ${r.nome}(${r.args})  ${r.definidor ? "SECURITY DEFINER" : "normal"}`);
  console.log(`    tabelas: ${tabelas.join(", ")}`);
  console.log(`    filtra por token/id: ${/p_token|p_id|p_cotacao|p_contagem/.test(r.corpo) ? "sim" : "NÃO"}`);
}
await c.end();
