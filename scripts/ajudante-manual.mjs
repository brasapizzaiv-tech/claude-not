// Junta o manual do Ajudante (docs/ajudante/*.md) num módulo TS que vai
// junto no build. Rode depois de mexer em qualquer arquivo do manual:
//   node scripts/ajudante-manual.mjs
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const RAIZ = join(import.meta.dirname, "..");
const pasta = join(RAIZ, "docs", "ajudante");
const arquivos = readdirSync(pasta).filter((f) => f.endsWith(".md")).sort();
const texto = arquivos
  .map((f) => readFileSync(join(pasta, f), "utf8").replace(/\r\n/g, "\n").trim())
  .join("\n\n---\n\n");

// Repositório público: o manual não pode levar dado pessoal nem chave.
const proibidos = [/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/, /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/, /[\w.-]+@[\w-]+\.[\w.]+/, /sk-ant-/i];
for (const r of proibidos) {
  const m = texto.match(r);
  if (m) throw new Error(`Manual tem algo que não pode ir pro git: "${m[0]}"`);
}

const saida = `// GERADO por scripts/ajudante-manual.mjs a partir de docs/ajudante/*.md — não edite à mão.\n// ${arquivos.join(", ")}\nexport const MANUAL = ${JSON.stringify(texto)};\n`;
writeFileSync(join(RAIZ, "src", "lib", "ajudante", "manual.ts"), saida);
console.log(`manual: ${arquivos.length} arquivos, ${texto.length} caracteres`);
