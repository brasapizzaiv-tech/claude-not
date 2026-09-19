// Inventário das tabelas: quem já tem empresa_id, quem tem RLS, tamanho.
import pg from "pg";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const c = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

const { rows } = await c.query(`
  select t.tablename as tabela,
         c.relrowsecurity as rls,
         (select count(*) from pg_policies p where p.tablename = t.tablename)::int as politicas,
         exists (
           select 1 from information_schema.columns col
            where col.table_schema = 'public' and col.table_name = t.tablename
              and col.column_name = 'empresa_id'
         ) as tem_empresa,
         coalesce(s.n_live_tup, 0)::int as linhas
    from pg_tables t
    join pg_class c on c.relname = t.tablename and c.relnamespace = 'public'::regnamespace
    left join pg_stat_user_tables s on s.relname = t.tablename
   where t.schemaname = 'public'
   order by t.tablename
`);

const com = rows.filter((r) => r.tem_empresa);
const sem = rows.filter((r) => !r.tem_empresa);
const semRls = rows.filter((r) => !r.rls);

console.log(`tabelas: ${rows.length}`);
console.log(`  já com empresa_id: ${com.length}`);
console.log(`  sem empresa_id:    ${sem.length}`);
console.log(`  sem RLS ligado:    ${semRls.length}`);
console.log(`\n--- SEM empresa_id (tabela · linhas · rls · políticas) ---`);
for (const r of sem) {
  console.log(`${r.tabela.padEnd(34)} ${String(r.linhas).padStart(7)}  ${r.rls ? "rls" : "SEM RLS"}  ${r.politicas}p`);
}
console.log(`\n--- JÁ com empresa_id ---`);
console.log(com.map((r) => r.tabela).join(", "));

await c.end();
