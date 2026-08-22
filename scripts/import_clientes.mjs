// Importa clientes do CRM (arquivo "Excel HTML" .xls) para a tabela clientes.
// Uso: node scripts/import_clientes.mjs "<caminho do .xls>"
import { readFileSync } from "node:fs";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const arquivo = process.argv[2];
if (!arquivo) {
  console.error("Informe o caminho do arquivo .xls");
  process.exit(1);
}
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Falta DATABASE_URL no .env.local");
  process.exit(1);
}

const html = readFileSync(arquivo, "utf8");
const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) =>
  [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) =>
    c[1]
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim(),
  ),
);
const data = rows.slice(1).filter((r) => r.length >= 4);

const nomeLimpo = (r) => (r[1] || "").replace(/^#\d+\s*-\s*/, "").trim();
const nomeReal = (r) => {
  const n = nomeLimpo(r);
  const soDig = n.replace(/\D/g, "");
  return n && !/^\*+$/.test(n) && !(soDig.length >= 8 && soDig.length === n.replace(/\s/g, "").length);
};
const telDigitos = (r) => {
  let d = (r[3] || "").replace(/\D/g, "");
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2); // tira DDI
  return d;
};

// Dedup por telefone (fica com quem tem mais pedidos).
const porTel = new Map();
for (const r of data) {
  if (!nomeReal(r)) continue;
  const tel = telDigitos(r);
  if (tel.length < 10) continue;
  const pedidos = Number(r[8] || "0") || 0;
  const atual = porTel.get(tel);
  if (!atual || pedidos > atual.pedidos) {
    porTel.set(tel, {
      nome: nomeLimpo(r),
      telefone: (r[3] || "").trim(),
      bairro: r[12] && r[12] !== "n/d" ? r[12] : null,
      pedidos,
    });
  }
}
const clientes = [...porTel.values()];
console.log(`Linhas: ${data.length} · únicos por telefone: ${clientes.length}`);

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();

// Telefones já existentes (evita duplicar em re-execução).
const { rows: existentes } = await client.query(
  "select telefone from clientes where telefone is not null",
);
const jaTem = new Set(existentes.map((e) => (e.telefone || "").replace(/\D/g, "").replace(/^55(?=\d{10,})/, "")));

let inseridos = 0;
let pulados = 0;
for (const c of clientes) {
  const tel = c.telefone.replace(/\D/g, "").replace(/^55(?=\d{10,})/, "");
  if (jaTem.has(tel)) {
    pulados++;
    continue;
  }
  await client.query(
    `insert into clientes (nome, telefone, bairro, ativo) values ($1,$2,$3,true)`,
    [c.nome, c.telefone, c.bairro],
  );
  jaTem.add(tel);
  inseridos++;
}

console.log(`✓ Inseridos: ${inseridos} · já existiam (pulados): ${pulados}`);
await client.end();
