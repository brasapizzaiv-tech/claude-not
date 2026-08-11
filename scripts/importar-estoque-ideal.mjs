// Importa o "Estoque ideal" de cada produto de um CSV do vmarket.
// Casa pelo nome do produto (normalizado) e atualiza produtos.estoque_ideal.
// Uso: node scripts/importar-estoque-ideal.mjs "caminho/arquivo.csv"
import { readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const arquivo = process.argv[2];
if (!arquivo) {
  console.error('Uso: node scripts/importar-estoque-ideal.mjs "arquivo.csv"');
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const norm = (s) => (s || "").trim().toLowerCase().replace(/\s+/g, " ");
const num = (v) => {
  const s = (v ?? "").toString().trim();
  if (!s) return null;
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? null : n;
};

const conteudo = readFileSync(arquivo, "utf8");
const linhas = parse(conteudo, {
  delimiter: ";",
  columns: true,
  skip_empty_lines: true,
  relax_quotes: true,
  relax_column_count: true,
  trim: true,
  bom: true,
});

// Mapa de produtos existentes (nome normalizado -> id)
const { data: prods } = await supabase.from("produtos").select("id, nome");
const idPorNome = new Map((prods || []).map((p) => [norm(p.nome), p.id]));

let atualizados = 0;
const naoEncontrados = [];

for (const l of linhas) {
  const nome = (l["Nome do produto"] || "").trim();
  if (!nome) continue;
  const ideal = num(l["Estoque ideal"]);
  if (ideal == null) continue;

  const pid = idPorNome.get(norm(nome));
  if (!pid) {
    naoEncontrados.push(nome);
    continue;
  }
  const { error } = await supabase
    .from("produtos")
    .update({ estoque_ideal: ideal })
    .eq("id", pid);
  if (!error) atualizados++;
}

console.log(`✓ ${atualizados} produtos com estoque ideal atualizado.`);
if (naoEncontrados.length) {
  console.log(`\n⚠ ${naoEncontrados.length} não bateram com o cadastro:`);
  naoEncontrados.forEach((n) => console.log("   -", n));
}
