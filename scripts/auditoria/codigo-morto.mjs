// Auditoria (Etapa 2) — só lê arquivos, não mexe em nada.
// Lista módulos de src/lib e src/components que nenhum outro arquivo importa,
// e exports de src/lib que ninguém usa por nome. Rotas (page/route/layout…)
// ficam de fora: são entradas do Next, não precisam ser importadas.
// Rode: node scripts/auditoria/codigo-morto.mjs
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, dirname, resolve } from "node:path";

const RAIZ = resolve(import.meta.dirname, "..", "..");
const SRC = join(RAIZ, "src");
const andar = (d) => readdirSync(d).flatMap((n) => {
  const p = join(d, n);
  return statSync(p).isDirectory() ? andar(p) : /\.(ts|tsx|mjs|js)$/.test(n) ? [p] : [];
});
const arquivos = andar(SRC);
const extras = ["scripts"].flatMap((d) => { try { return andar(join(RAIZ, d)); } catch { return []; } });
const textos = new Map([...arquivos, ...extras].map((f) => [f, readFileSync(f, "utf8")]));

// Resolve "@/x" e caminhos relativos pra um arquivo de src.
const exts = ["", ".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.tsx"];
const achar = (de, spec) => {
  const base = spec.startsWith("@/") ? join(SRC, spec.slice(2)) : spec.startsWith(".") ? resolve(dirname(de), spec) : null;
  if (!base) return null;
  for (const e of exts) { const p = base + e; if (textos.has(p)) return p; }
  return null;
};
const RE = /(?:from\s*|import\s*\(\s*|require\(\s*|import\s+)["']([^"']+)["']/g;
const importados = new Map(); // arquivo -> Set(nomes importados) ou "*"
for (const [f, t] of textos) {
  for (const m of t.matchAll(RE)) {
    const alvo = achar(f, m[1]);
    if (!alvo || alvo === f) continue;
    if (!importados.has(alvo)) importados.set(alvo, new Set());
    // Nomes importados: { a, b as c } antes do from.
    const antes = t.slice(Math.max(0, m.index - 400), m.index);
    const chave = antes.lastIndexOf("{");
    const fecha = antes.lastIndexOf("}");
    if (chave >= 0 && fecha > chave && !antes.slice(fecha).includes(";")) {
      for (const n of antes.slice(chave + 1, fecha).split(",")) {
        const nome = n.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0].trim();
        if (nome) importados.get(alvo).add(nome);
      }
    } else importados.get(alvo).add("*");
  }
}

const ehRota = (f) => /[\\/](page|layout|route|loading|error|not-found|template|default|global-error|opengraph-image|icon|manifest|sitemap|robots)\.(tsx?|js)$/.test(f) || /[\\/](middleware|proxy|instrumentation)\.ts$/.test(f);
const soltos = arquivos.filter((f) => !ehRota(f) && !importados.has(f));
console.log(`\n# Arquivos que ninguém importa (${soltos.length}):`);
for (const f of soltos) console.log("-", relative(RAIZ, f));

console.log("\n# Exports de src/lib que ninguém importa pelo nome:");
for (const f of arquivos.filter((x) => x.includes(`${join("src", "lib")}`))) {
  const usados = importados.get(f);
  if (!usados || usados.has("*")) continue;
  const t = textos.get(f);
  const exportados = [...t.matchAll(/export\s+(?:async\s+)?(?:function|const|let|class|type|interface|enum)\s+([A-Za-z0-9_]+)/g)].map((m) => m[1]);
  const mortos = exportados.filter((n) => !usados.has(n) && !new RegExp(`\\b${n}\\b`).test(t.replace(new RegExp(`export\\s+(?:async\\s+)?(?:function|const|let|class|type|interface|enum)\\s+${n}\\b`), "")));
  if (mortos.length) console.log("-", relative(RAIZ, f), "→", mortos.join(", "));
}
