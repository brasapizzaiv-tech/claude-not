// Atualiza/insere fornecedores com dados completos de um CSV do vmarket.
// Casa pelos nomes já existentes (normalizado) para não duplicar.
// Uso: node scripts/importar-fornecedores.mjs "caminho/lista_fornecedores.csv"
import { readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const arquivo = process.argv[2];
if (!arquivo) {
  console.error('Uso: node scripts/importar-fornecedores.mjs "arquivo.csv"');
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const norm = (s) => (s || "").trim().toLowerCase().replace(/\s+/g, " ");
const txt = (v) => {
  const s = (v ?? "").toString().trim();
  return s ? s : null;
};
const num = (v) => {
  const s = (v ?? "").toString().trim();
  if (!s) return null;
  const n = Number(s.replace(",", "."));
  return isNaN(n) ? null : n;
};
// Emails deste export são placeholders (email@email, nao@tem, etc.) → descarta.
const emailReal = (v) => {
  const s = txt(v);
  if (!s) return null;
  if (/email@email|@tem\.com|@nao\.com|@n[aã]o\./i.test(s)) return null;
  return s;
};

const conteudo = readFileSync(arquivo, "utf8");
const linhas = parse(conteudo, {
  delimiter: ";",
  columns: true,
  skip_empty_lines: true,
  relax_quotes: true,
  trim: true,
  bom: true,
});

// Fornecedores existentes (por nome normalizado).
const { data: existentes } = await supabase
  .from("fornecedores")
  .select("id, nome");
const idPorNome = new Map((existentes || []).map((f) => [norm(f.nome), f.id]));

let atualizados = 0;
let inseridos = 0;

for (const l of linhas) {
  const nome = txt(l["nome"]);
  if (!nome) continue;

  const dados = {
    cnpj: txt(l["cnpj"]),
    contato: txt(l["nome_contato"]),
    telefone: txt(l["telefone_contato"]),
    email: emailReal(l["email_contato"]),
    pedido_minimo: num(l["pedido_minimo"]),
    valor_frete: num(l["valor_frete"]),
    prazo_pagamento: txt(l["prazo_pagamento"]),
    prazo_entrega: txt(l["prazo_entrega"]),
  };

  const existenteId = idPorNome.get(norm(nome));
  if (existenteId) {
    const { error } = await supabase
      .from("fornecedores")
      .update(dados)
      .eq("id", existenteId);
    if (error) console.error(`Erro ao atualizar ${nome}:`, error.message);
    else atualizados++;
  } else {
    const { error } = await supabase
      .from("fornecedores")
      .insert({ nome, ...dados });
    if (error) console.error(`Erro ao inserir ${nome}:`, error.message);
    else inseridos++;
  }
}

console.log(`✓ ${atualizados} fornecedores atualizados, ${inseridos} novos inseridos.`);
