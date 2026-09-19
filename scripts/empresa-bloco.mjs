// Gera a migration de um bloco: carimba as tabelas com empresa_id e troca a
// política "todo mundo logado vê tudo" por "só vê o da sua empresa".
// Uso: node scripts/_gera-bloco.mjs <numero> <arquivo> <titulo> -- tabela tabela ...
import pg from "pg";
import dotenv from "dotenv";
import fs from "node:fs";
dotenv.config({ path: ".env.local" });

const [, , numero, arquivo, titulo, , ...tabelas] = process.argv;

const c = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

const { rows: pols } = await c.query(
  `select tablename, policyname from pg_policies where schemaname='public' and tablename = any($1)`,
  [tabelas],
);
const { rows: existem } = await c.query(
  `select tablename from pg_tables where schemaname='public' and tablename = any($1)`,
  [tabelas],
);
const achadas = new Set(existem.map((r) => r.tablename));
const faltando = tabelas.filter((t) => !achadas.has(t));
if (faltando.length) {
  console.error("tabelas que não existem:", faltando.join(", "));
  process.exit(1);
}

const { rows: tam } = await c.query(
  `select relname tabela, coalesce(n_live_tup,0)::int linhas
     from pg_stat_user_tables where relname = any($1)`,
  [tabelas],
);
const linhas = Object.fromEntries(tam.map((r) => [r.tabela, r.linhas]));

let sql = `-- ETAPA 2 DO MULTIEMPRESA — bloco ${numero}: ${titulo}
--
-- Cada linha destas tabelas passa a ter dono. Duas coisas por tabela:
--
--   1. a coluna \`empresa_id\`, que já nasce preenchida com a Brasa (é o que
--      \`empresa_atual()\` responde hoje), então NENHUM dado muda de lugar;
--   2. a regra de leitura e escrita deixa de ser "quem está logado vê tudo" e
--      passa a ser "quem está logado vê o da empresa dele".
--
-- O \`with check\` é tão importante quanto o \`using\`: sem ele dá pra LER só o
-- seu e mesmo assim GRAVAR uma linha carimbada com a empresa de outro.
--
-- Atenção: isto protege quem entra com login. Os apps por link (cotação do
-- fornecedor, contagem da equipe) falam com o banco pela chave administrativa,
-- que passa por cima destas regras — lá o filtro é no código, e vai junto
-- neste mesmo commit.

`;

for (const t of tabelas) {
  const nomes = pols.filter((p) => p.tablename === t).map((p) => p.policyname);
  sql += `-- ${t} (${linhas[t] ?? 0} linhas)\n`;
  sql += `alter table public.${t}\n  add column if not exists empresa_id uuid not null\n    default public.empresa_atual() references public.empresas (id);\n`;
  sql += `create index if not exists ${t}_empresa_idx on public.${t} (empresa_id);\n`;
  for (const n of nomes) sql += `drop policy if exists "${n}" on public.${t};\n`;
  sql += `create policy ${t}_empresa on public.${t} for all to authenticated\n`;
  sql += `  using (empresa_id = public.empresa_atual())\n`;
  sql += `  with check (empresa_id = public.empresa_atual());\n\n`;
}

fs.writeFileSync(`supabase/migrations/${arquivo}`, sql);
console.log(`gerado supabase/migrations/${arquivo} — ${tabelas.length} tabelas`);
await c.end();
