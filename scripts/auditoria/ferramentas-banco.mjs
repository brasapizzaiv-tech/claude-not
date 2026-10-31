// Auditoria etapa 0 — o que o banco oferece pra medir (só leitura).
//   node scripts/auditoria/ferramentas-banco.mjs
import { conectar, hostDoBanco } from "./db.mjs";

const c = await conectar();
const q = async (sql) => (await c.query(sql)).rows;

console.log("Host do banco:", hostDoBanco());
console.log("Versão:", (await q("show server_version"))[0].server_version);
console.log("Extensões:", (await q("select extname, extversion from pg_extension order by 1")).map((r) => `${r.extname} ${r.extversion}`).join(", "));
try {
  const info = await q("select stats_reset from extensions.pg_stat_statements_info");
  const n = await q("select count(*)::int n, round(sum(total_exec_time))::bigint ms from extensions.pg_stat_statements");
  console.log("pg_stat_statements: OK — estatística desde", info[0]?.stats_reset, "·", n[0].n, "consultas,", n[0].ms, "ms no total");
} catch (e) {
  console.log("pg_stat_statements: SEM ACESSO —", e.message);
}
const t = await q("select count(*)::int n from pg_tables where schemaname='public'");
console.log("Tabelas no public:", t[0].n);
const tam = await q("select pg_size_pretty(pg_database_size(current_database())) tam");
console.log("Tamanho do banco:", tam[0].tam);
const maiores = await q(`select relname, n_live_tup::bigint linhas, pg_size_pretty(pg_total_relation_size(relid)) tam
  from pg_stat_user_tables where schemaname='public' order by pg_total_relation_size(relid) desc limit 15`);
console.log("Maiores tabelas:");
for (const r of maiores) console.log(`  ${r.relname}: ${r.linhas} linhas, ${r.tam}`);
const cron = await q("select count(*)::int n from pg_extension where extname='pg_cron'");
if (cron[0].n) console.log("pg_cron jobs:", JSON.stringify(await q("select jobname, schedule, active from cron.job")));
await c.end();
