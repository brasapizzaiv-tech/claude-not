// Importa produtos de um CSV exportado do sistema vmarket.
// Uso: node scripts/importar-produtos.mjs "caminho/do/arquivo.csv"
import { readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const arquivo = process.argv[2];
if (!arquivo) {
  console.error('Uso: node scripts/importar-produtos.mjs "arquivo.csv"');
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// ---------- Normalizações ----------
function normUnidade(g) {
  const s = (g || "").trim().toLowerCase();
  const map = {
    un: "un", und: "un", unid: "un", unidade: "un", "": "un",
    kg: "kg", k: "kg",
    g: "g", gr: "g",
    l: "L", lt: "L", litro: "L",
    ml: "ml",
    cx: "cx", caixa: "cx",
    pct: "pct", pacote: "pct",
    bandeja: "bandeja",
    fardo: "fardo",
    saco: "saco",
    dz: "dz", duzia: "dz",
  };
  return map[s] || "un";
}

function parseMoeda(v) {
  if (!v) return null;
  const n = Number(
    String(v).replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", "."),
  );
  return isNaN(n) || n === 0 ? null : n;
}

function cleanCodigo(v) {
  if (!v) return null;
  const s = String(v).replace(/[="]/g, "").trim();
  return s || null;
}

// ---------- Leitura e parse ----------
const conteudo = readFileSync(arquivo, "utf8");
const linhas = parse(conteudo, {
  delimiter: ";",
  columns: true,
  skip_empty_lines: true,
  relax_quotes: true,
  trim: true,
  bom: true,
});

const registros = [];
const secoes = new Set();

for (const l of linhas) {
  const nome = (l["Produto"] || "").trim();
  if (!nome) continue;
  const secao = (l["Secao"] || "").trim() || "Sem categoria";
  secoes.add(secao);
  registros.push({
    nome,
    marca: (l["Marca"] || "").trim() || null,
    unidade: normUnidade(l["Gramatura"]),
    codigo: cleanCodigo(l["Codigo"]),
    aceita_similar: (l["Aceita Marca Similar"] || "").trim() === "Sim",
    preco_referencia: parseMoeda(l["Valor Homologado"]),
    _secao: secao,
  });
}

console.log(
  `Lidos ${registros.length} produtos em ${secoes.size} categorias.`,
);

// ---------- Categorias (upsert) ----------
const { data: cats, error: eCat } = await supabase
  .from("categorias")
  .upsert(
    [...secoes].map((nome) => ({ nome })),
    { onConflict: "nome" },
  )
  .select();
if (eCat) {
  console.error("Erro nas categorias:", eCat.message);
  process.exit(1);
}
const catId = new Map(cats.map((c) => [c.nome, c.id]));

// ---------- Produtos: pula os que já existem (por nome) ----------
const { data: existentes } = await supabase.from("produtos").select("nome");
const jaExiste = new Set(
  (existentes || []).map((p) => p.nome.trim().toLowerCase()),
);

const novos = registros
  .filter((r) => !jaExiste.has(r.nome.toLowerCase()))
  .map((r) => ({
    nome: r.nome,
    marca: r.marca,
    unidade: r.unidade,
    codigo: r.codigo,
    aceita_similar: r.aceita_similar,
    preco_referencia: r.preco_referencia,
    categoria_id: catId.get(r._secao) ?? null,
  }));

if (novos.length === 0) {
  console.log("Nada novo para importar (todos já existem). ✅");
  process.exit(0);
}

const { error: eProd } = await supabase.from("produtos").insert(novos);
if (eProd) {
  console.error("Erro ao inserir produtos:", eProd.message);
  process.exit(1);
}

console.log(
  `✓ ${novos.length} produtos importados. (${registros.length - novos.length} já existiam)`,
);
