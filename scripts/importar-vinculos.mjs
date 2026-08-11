// Importa vínculos produto↔fornecedor de um relatório .xls (HTML) do vmarket.
// Cadastra os fornecedores únicos e cria as ligações.
// Uso: node scripts/importar-vinculos.mjs "caminho/relatorio-produtos-vinculados.xls"
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const arquivo = process.argv[2];
if (!arquivo) {
  console.error('Uso: node scripts/importar-vinculos.mjs "arquivo.xls"');
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// ---------- Parse do HTML ----------
let html = readFileSync(arquivo, "utf8").replace(/\r?\n/g, " ");
const trs = [...html.matchAll(/<tr[^>]*>(.*?)<\/tr>/gi)].map((m) => m[1]);
const cells = (r) =>
  [...r.matchAll(/<t[dh][^>]*>(.*?)<\/t[dh]>/gi)].map((c) =>
    c[1].replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim(),
  );

const linhas = trs.map(cells).filter((c) => c.length >= 3);
// remove cabeçalho
if (linhas[0] && /produto/i.test(linhas[0][1])) linhas.shift();

const fornecedoresSet = new Set();
const registros = []; // { produto, fornecedores: [] }

for (const c of linhas) {
  const produto = (c[1] || "").trim();
  const empresas = (c[2] || "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!produto || empresas.length === 0) continue;
  empresas.forEach((e) => fornecedoresSet.add(e));
  registros.push({ produto, fornecedores: empresas });
}

console.log(
  `Lidos ${registros.length} produtos com vínculos · ${fornecedoresSet.size} fornecedores únicos.`,
);

// ---------- Cadastra fornecedores (upsert por nome) ----------
const { data: forns, error: eF } = await supabase
  .from("fornecedores")
  .upsert(
    [...fornecedoresSet].map((nome) => ({ nome })),
    { onConflict: "nome" },
  )
  .select("id, nome");
if (eF) {
  console.error("Erro ao cadastrar fornecedores:", eF.message);
  process.exit(1);
}
const fornId = new Map(forns.map((f) => [f.nome, f.id]));

// ---------- Mapa de produtos (nome normalizado: minúsculo, espaços colapsados) ----------
const norm = (s) => s.trim().toLowerCase().replace(/\s+/g, " ");
const { data: prods } = await supabase.from("produtos").select("id, nome");
const prodId = new Map((prods || []).map((p) => [norm(p.nome), p.id]));

// ---------- Monta vínculos ----------
const vinculos = [];
const naoEncontrados = [];
for (const r of registros) {
  const pid = prodId.get(norm(r.produto));
  if (!pid) {
    naoEncontrados.push(r.produto);
    continue;
  }
  for (const nomeF of r.fornecedores) {
    const fid = fornId.get(nomeF);
    if (fid) vinculos.push({ produto_id: pid, fornecedor_id: fid });
  }
}

// Insere em lotes, ignorando duplicados.
let inseridos = 0;
for (let i = 0; i < vinculos.length; i += 500) {
  const lote = vinculos.slice(i, i + 500);
  const { error } = await supabase
    .from("fornecedor_produto")
    .upsert(lote, { onConflict: "fornecedor_id,produto_id", ignoreDuplicates: true });
  if (error) {
    console.error("Erro ao inserir vínculos:", error.message);
    process.exit(1);
  }
  inseridos += lote.length;
}

console.log(`✓ ${fornecedoresSet.size} fornecedores cadastrados.`);
console.log(`✓ ${inseridos} vínculos produto↔fornecedor criados.`);
if (naoEncontrados.length) {
  console.log(
    `\n⚠ ${naoEncontrados.length} produto(s) do relatório não bateram com o cadastro:`,
  );
  naoEncontrados.forEach((n) => console.log("   -", n));
}
