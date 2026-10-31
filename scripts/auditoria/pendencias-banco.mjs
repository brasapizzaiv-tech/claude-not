// Auditoria etapa 0 — pendências conhecidas do lado do banco (só leitura):
// policies "USING (true)" e funções SECURITY DEFINER que dá pra chamar sem login.
//   node scripts/auditoria/pendencias-banco.mjs
import { conectar } from "./db.mjs";

const c = await conectar();
const q = async (sql) => (await c.query(sql)).rows;

const semRls = await q(`select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and not c.relrowsecurity order by 1`);
console.log(`Tabelas do public SEM RLS ligada: ${semRls.length}`, semRls.map((r) => r.relname).join(", "));

const abertas = await q(`select tablename, policyname, cmd, roles::text roles, qual, with_check
  from pg_policies where schemaname='public'
  and (coalesce(qual,'')='true' or coalesce(with_check,'')='true')
  order by tablename, policyname`);
const porPapel = {};
for (const p of abertas) {
  const papel = p.roles.includes("anon") ? "anon" : p.roles.includes("public") ? "public (inclui anon)" : p.roles.includes("authenticated") ? "authenticated" : p.roles;
  (porPapel[papel] ??= new Set()).add(p.tablename);
}
console.log(`\nPolicies com USING/WITH CHECK (true): ${abertas.length}`);
for (const [papel, t] of Object.entries(porPapel)) console.log(`  ${papel}: ${t.size} tabelas — ${[...t].join(", ")}`);

const definer = await q(`select p.proname, pg_get_function_identity_arguments(p.oid) args,
    has_function_privilege('anon', p.oid, 'EXECUTE') anon,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') autenticado
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prosecdef order by 1`);
const anon = definer.filter((f) => f.anon);
console.log(`\nFunções SECURITY DEFINER no public: ${definer.length} · chamáveis SEM login (anon): ${anon.length}`);
for (const f of anon) console.log(`  ${f.proname}(${f.args})`);
await c.end();
