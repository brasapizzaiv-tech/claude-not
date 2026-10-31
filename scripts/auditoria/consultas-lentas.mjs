// Auditoria — as consultas que mais pesam no banco, pelas estatísticas que o
// próprio Postgres guarda (pg_stat_statements). Só leitura.
//   node scripts/auditoria/consultas-lentas.mjs [--explain] [--json]
// --explain: plano de execução (EXPLAIN GENERIC_PLAN, sem executar a consulta)
// das 20 maiores das telas, rodado como o papel "authenticated" (com RLS).
import { conectar } from "./db.mjs";

const comPlano = process.argv.includes("--explain");
const c = await conectar();
const q = async (s, p = []) => (await c.query(s, p)).rows;

const [info] = await q(`select stats_reset from extensions.pg_stat_statements_info`);
const base = `
  select s.queryid::text, r.rolname papel, s.calls::bigint chamadas,
         round(s.total_exec_time::numeric) total_ms, round(s.mean_exec_time::numeric, 1) media_ms,
         round(s.max_exec_time::numeric) max_ms, s.rows::bigint linhas,
         round(100.0 * s.shared_blks_hit / nullif(s.shared_blks_hit + s.shared_blks_read, 0), 1) cache_pct,
         regexp_replace(s.query, '\\s+', ' ', 'g') consulta
  from extensions.pg_stat_statements s join pg_roles r on r.oid = s.userid`;
// Só o que as telas e as APIs pedem (authenticated/anon/service_role). O resto
// é a máquina da própria Supabase (realtime, auth, pooler) — vai num resumo.
const daApp = `r.rolname in ('authenticated', 'anon', 'service_role')`;
const porTotal = await q(`${base} where ${daApp} order by s.total_exec_time desc limit 20`);
const porMedia = await q(`${base} where ${daApp} and s.calls >= 20 order by s.mean_exec_time desc limit 20`);
const porPapel = await q(`
  select r.rolname papel, sum(s.calls)::bigint chamadas, round(sum(s.total_exec_time)::numeric) total_ms
  from extensions.pg_stat_statements s join pg_roles r on r.oid = s.userid group by 1 order by 3 desc`);

let planos = [];
if (comPlano) {
  for (const l of porTotal.concat(porMedia)) {
    if (planos.some((p) => p.queryid === l.queryid)) continue;
    if (!/^\s*(select|with)\b/i.test(l.consulta)) continue;
    try {
      await c.query("begin read only");
      await c.query(`set local role ${l.papel === "anon" ? "anon" : "authenticated"}`);
      const r = await c.query(`explain (generic_plan, costs) ${l.consulta}`);
      planos.push({ queryid: l.queryid, plano: r.rows.map((x) => x["QUERY PLAN"]).join("\n") });
    } catch (e) {
      planos.push({ queryid: l.queryid, erro: String(e.message).slice(0, 160) });
    } finally {
      await c.query("rollback");
    }
  }
}
await c.end();

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ desde: info.stats_reset, porPapel, porTotal, porMedia, planos }, null, 2));
} else {
  const corta = (s, n = 140) => (s.length > n ? s.slice(0, n) + "…" : s);
  console.log(`Estatísticas desde ${info.stats_reset?.toISOString?.() ?? info.stats_reset}\n`);
  console.log("Por papel:"); console.table(porPapel);
  console.log("\nTop 20 por tempo TOTAL (telas/APIs):");
  console.table(porTotal.map((l) => ({ ...l, consulta: corta(l.consulta) })));
  console.log("\nTop 20 por tempo MÉDIO (≥ 20 chamadas):");
  console.table(porMedia.map((l) => ({ ...l, consulta: corta(l.consulta) })));
  for (const p of planos) console.log(`\n--- plano ${p.queryid}\n${p.plano ?? "ERRO: " + p.erro}`);
}
