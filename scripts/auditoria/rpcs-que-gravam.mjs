// Auditoria — quais funções do banco GRAVAM alguma coisa (insert/update/delete
// no corpo). Serve pra saber quais telas não podem ser abertas na produção
// pelo robô de medição. Só leitura.
//   node scripts/auditoria/rpcs-que-gravam.mjs [nome1 nome2 ...]
import { conectar } from "./db.mjs";

// Insert, update (com ou sem apelido da tabela) ou delete no corpo da função.
// Vai como parâmetro ($2) pra nenhuma barra se perder no caminho.
const GRAVA = String.raw`\m(insert\s+into|update\s+[a-z_."]+(\s+[a-z_]+)?\s+set|delete\s+from)\M`;

const nomes = process.argv.slice(2);
const c = await conectar();
const { rows } = await c.query(
  `select p.proname, p.prosecdef, (p.prosrc ~* $2) grava
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and ($1::text[] is null or p.proname = any($1))
   order by 1`,
  [nomes.length ? nomes : null, GRAVA],
);
for (const r of rows) console.log(`${r.grava ? "GRAVA " : "lê    "} ${r.proname}${r.prosecdef ? " (definer)" : ""}`);
await c.end();
