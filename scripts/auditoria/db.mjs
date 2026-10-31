// Auditoria — conexão SÓ LEITURA com o banco.
// Toda consulta roda numa sessão com default_transaction_read_only=on:
// se algum script daqui tentar gravar, o Postgres recusa.
import { createRequire } from "node:module";
import { join } from "node:path";

const RAIZ = join(import.meta.dirname, "..", "..");
const require = createRequire(join(RAIZ, "package.json"));
const dotenv = require("dotenv");
const pg = require("pg");
dotenv.config({ path: join(RAIZ, ".env.local"), quiet: true });

export async function conectar() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL no .env.local");
  const c = new pg.Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    application_name: "auditoria-leitura",
  });
  await c.connect();
  // O pooler da Supabase não repassa opções de inicialização: liga aqui.
  await c.query("set default_transaction_read_only = on");
  await c.query("set statement_timeout = 30000");
  const { rows } = await c.query("show default_transaction_read_only");
  if (rows[0].default_transaction_read_only !== "on") {
    await c.end();
    throw new Error("A sessão não ficou só leitura — abortado.");
  }
  return c;
}

/** Só o host do banco (sem usuário nem senha), pra saber a região. */
export function hostDoBanco() {
  try {
    return new URL(process.env.DATABASE_URL).hostname;
  } catch {
    return "?";
  }
}
