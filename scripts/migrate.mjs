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

  // Colunas secretas (SEC-04, migrations 0292 e 0295): a sessão do painel não
  // lê o token/PIN/código de colaboradores e entregadores, nem (depois da 0295)
  // os dados pessoais da equipe — esses só pela visão colaboradores_dados. O
  // grant de tabela inteira logo acima devolveria tudo, então reaplica aqui,
  // sempre por último.
  const { rows: r0295 } = await client.query("select 1 from _migrations where nome like '0295%' limit 1");
  const PESSOAIS = [
    "cpf", "rg", "pis", "ctps", "cnh", "cnh_categoria", "cnh_validade", "nascimento",
    "cep", "endereco", "endereco_numero", "bairro", "cidade", "uf", "telefone", "telefone_emergencia",
    "nome_pai", "nome_mae", "genero", "tipo_sanguineo", "conjuge", "filhos",
    "salario_base", "valor_dia", "valor_noite", "valor_free", "numero_folha",
  ];
  const SECRETAS = {
    colaboradores: ["token", "pin", "codigo", ...(r0295.length ? PESSOAIS : [])],
    entregadores: ["token", "codigo"],
  };
  for (const [tabela, secretas] of Object.entries(SECRETAS)) {
    const { rows } = await client.query(
      "select column_name from information_schema.columns where table_schema = 'public' and table_name = $1 and column_name <> all ($2::text[]) order by ordinal_position",
      [tabela, secretas],
    );
    if (!rows.length) continue;
    const cols = rows.map((r) => `"${r.column_name.replace(/"/g, '""')}"`).join(", ");
    await client.query(`revoke select on public.${tabela} from authenticated`);
    await client.query(`grant select (${cols}) on public.${tabela} to authenticated`);
  }
  // A visão da ficha completa é só leitura (gravar por ela pularia o RLS).
  await client.query(`
    do $x$ begin
      if to_regclass('public.colaboradores_dados') is not null then
        revoke insert, update, delete, truncate, references, trigger on public.colaboradores_dados from authenticated;
      end if;
    end $x$;
  `);
  console.log(`✓ Colunas secretas fora da sessão (token/PIN/código${r0295.length ? " e dados pessoais da equipe" : ""})`);

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
