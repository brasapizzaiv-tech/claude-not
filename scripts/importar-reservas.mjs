// Importa as reservas exportadas do Supabase antigo (CSV do Table Editor) para
// a tabela reservas deste sistema.
//
// Uso:  node scripts/importar-reservas.mjs "C:/.../reservas_rows.csv"
//       node scripts/importar-reservas.mjs "C:/.../bloqueios_rows.csv" bloqueios
//       node scripts/importar-reservas.mjs "C:/.../config_rows.csv" config
//
// Roda duas vezes sem duplicar: reserva já existente (mesmo nome, telefone,
// data e turno) é pulada.
import { readFileSync } from "node:fs";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const arquivo = process.argv[2];
const tabela = process.argv[3] || "reservas";
if (!arquivo) {
  console.error("\n❌ Informe o arquivo CSV. Ex.: node scripts/importar-reservas.mjs \"C:/Users/.../reservas_rows.csv\"\n");
  process.exit(1);
}

// CSV do Supabase: campos entre aspas, aspas duplicadas dentro do texto.
function lerCsv(texto) {
  const linhas = [];
  let campo = "";
  let linha = [];
  let aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ",") { linha.push(campo); campo = ""; }
    else if (c === "\n") { linha.push(campo); linhas.push(linha); linha = []; campo = ""; }
    else if (c !== "\r") campo += c;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  const cabecalho = linhas.shift().map((h) => h.trim());
  return linhas
    .filter((l) => l.some((v) => v !== ""))
    .map((l) => Object.fromEntries(cabecalho.map((h, i) => [h, l[i] ?? ""])));
}

const vazio = (v) => v === "" || v == null || v === "null";
const txt = (v) => (vazio(v) ? null : String(v).trim());
const num = (v) => (vazio(v) ? null : Number(v));

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  const linhas = lerCsv(readFileSync(arquivo, "utf8"));
  console.log(`\n${linhas.length} linha(s) no arquivo.`);
  await client.connect();

  let novas = 0;
  let pulos = 0;

  for (const r of linhas) {
    if (tabela === "bloqueios") {
      const jaTem = await client.query(
        "select 1 from reservas_bloqueios where data = $1 and turno = $2",
        [r.data, r.turno],
      );
      if (jaTem.rowCount > 0) { pulos++; continue; }
      await client.query(
        "insert into reservas_bloqueios (data, turno, motivo) values ($1,$2,$3)",
        [r.data, r.turno, txt(r.motivo)],
      );
      novas++;
      continue;
    }

    if (tabela === "config") {
      await client.query(
        `insert into reservas_config (chave, valor) values ($1,$2)
         on conflict (chave) do update set valor = excluded.valor`,
        [r.chave, txt(r.valor)],
      );
      novas++;
      continue;
    }

    const jaTem = await client.query(
      "select 1 from reservas where nome = $1 and telefone = $2 and data = $3 and turno = $4",
      [r.nome, r.telefone, r.data, r.turno],
    );
    if (jaTem.rowCount > 0) { pulos++; continue; }

    const adultos = num(r.adultos);
    const criancas = num(r.criancas) ?? 0;
    const pessoas = num(r.pessoas) ?? (adultos ?? 0) + criancas;

    await client.query(
      `insert into reservas
         (nome, telefone, data, turno, chegada, pessoas, adultos, criancas,
          lugar, mesa, ocasiao, nascimento, observacao, status, origem, criado_em)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,coalesce($16::timestamptz, now()))`,
      [
        r.nome, r.telefone, r.data, r.turno, txt(r.chegada),
        pessoas, adultos, criancas,
        txt(r.lugar), txt(r.mesa), txt(r.ocasiao), txt(r.nascimento), txt(r.observacao),
        txt(r.status) || "nova",
        txt(r.origem) === "interno" ? "interno" : "site",
        txt(r.criado_em),
      ],
    );
    novas++;
  }

  console.log(`\n✓ ${novas} importada(s) · ${pulos} já existia(m) e foram puladas.\n`);
  await client.end();
}

main().catch(async (e) => {
  console.error("\n❌", e.message, "\n");
  try { await client.end(); } catch {}
  process.exit(1);
});
