// Aplica as migrações SQL de supabase/migrations no banco (Supabase/Postgres).
// Uso: npm run migrate
// Requer DATABASE_URL no arquivo .env.local
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, "..", "supabase", "migrations");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("\n❌ Falta DATABASE_URL no .env.local\n");
  process.exit(1);
}

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();
  console.log("✓ Conectado ao banco");

  await client.query(`
    create table if not exists public._migrations (
      nome text primary key,
      aplicada_em timestamptz not null default now()
    );
  `);

  const applied = new Set(
    (await client.query("select nome from public._migrations")).rows.map(
      (r) => r.nome,
    ),
  );

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`- ${file} (já aplicada)`);
      continue;
    }
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    console.log(`▶ aplicando ${file} ...`);
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query(
        "insert into public._migrations (nome) values ($1)",
        [file],
      );
      await client.query("commit");
      console.log(`✓ ${file} aplicada`);
      count++;
    } catch (err) {
      await client.query("rollback");
      console.error(`❌ Erro em ${file}:`, err.message);
      throw err;
    }
  }

  // Segunda camada (auditoria SEC-15): toda tabela do public TEM que ter RLS.
  // Tabela sem RLS com permissão pra API vira leitura/escrita pública na hora.
  // A rodada falha aqui, antes de dar qualquer permissão.
  const { rows: semRls } = await client.query(`
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity`);
  if (semRls.length) {
    throw new Error(`Tabela sem RLS no public: ${semRls.map((r) => r.relname).join(", ")}. Ponha "alter table ... enable row level security" na migration.`);
  }

  // A partir de 30/10/2026 a Supabase não dá mais permissão automática nas
  // tabelas novas do public. Depois de toda rodada (mesmo sem migration nova),
  // garante o acesso dos papéis LOGADO e SERVIDOR. O anônimo (chave pública)
  // NÃO ganha tabela nenhuma (SEC-15, migration 0290): só lê "empresas"; o que
  // é público passa por função com token. Funções: o Postgres já dá EXECUTE a
  // todos na criação; aqui não se devolve ao anon o que uma migration tirou.
  await client.query(`
    grant usage on schema public to anon, authenticated, service_role;
    grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
    grant usage, select, update on all sequences in schema public to authenticated, service_role;
    grant execute on all functions in schema public to authenticated, service_role;
    revoke all on all tables in schema public from anon;
    revoke all on all sequences in schema public from anon;
    grant select on public.empresas to anon;
  `);
  console.log("✓ Permissões dos papéis da API garantidas (authenticated e service_role; anon só lê empresas)");

  // Colunas secretas (SEC-04, migration 0292): a sessão do painel não lê o
  // token/PIN/código de colaboradores e entregadores. O grant de tabela inteira
  // logo acima devolveria tudo, então reaplica aqui, sempre por último.
  await client.query(`
    do $$
    declare t text; secretas text[]; cols text;
    begin
      for t, secretas in select * from (values
          ('colaboradores', array['token', 'pin', 'codigo']),
          ('entregadores', array['token', 'codigo'])
        ) as v(t, s)
      loop
        select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
          from information_schema.columns
         where table_schema = 'public' and table_name = t and column_name <> all (secretas);
        if cols is null then continue; end if;
        execute format('revoke select on public.%I from authenticated', t);
        execute format('grant select (%s) on public.%I to authenticated', cols, t);
      end loop;
    end $$;
  `);
  console.log("✓ Colunas secretas fora da sessão (token/PIN/código)");

  console.log(
    count === 0
      ? "\nNada novo. Banco já está atualizado. ✅"
      : `\n${count} migração(ões) aplicada(s). ✅`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => client.end());
