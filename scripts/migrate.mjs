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
