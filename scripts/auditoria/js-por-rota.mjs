// Auditoria — quanto JavaScript cada tela baixa na primeira visita.
// Lê .next/diagnostics/route-bundle-stats.json (gerado pelo `next build`) e
// soma o tamanho de cada pedaço (chunk), cru e comprimido (gzip, que é o que
// viaja pela rede). Também diz quais bibliotecas pesam mais nos maiores.
//   npx next build && node scripts/auditoria/js-por-rota.mjs [--json]
import { readFileSync, existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

const RAIZ = join(import.meta.dirname, "..", "..");
const STATS = join(RAIZ, ".next", "diagnostics", "route-bundle-stats.json");
if (!existsSync(STATS)) throw new Error("Rode `npx next build` antes (falta .next/diagnostics/route-bundle-stats.json).");

const rotas = JSON.parse(readFileSync(STATS, "utf8"));
const cache = new Map();
function chunk(p) {
  if (!cache.has(p)) {
    const buf = readFileSync(join(RAIZ, p.replace(/\\/g, "/")));
    // Turbopack escreve o caminho de cada módulo no chunk: dá pra ver o que tem dentro.
    const txt = buf.toString("utf8");
    const libs = new Map();
    for (const m of txt.matchAll(/\[project\]\/node_modules\/((?:@[^/]+\/)?[^/]+)\//g)) libs.set(m[1], (libs.get(m[1]) ?? 0) + 1);
    cache.set(p, { cru: buf.length, gz: gzipSync(buf, { level: 9 }).length, libs: [...libs.keys()] });
  }
  return cache.get(p);
}

// Chunks que TODA tela baixa (a base do Next + layout raiz).
const contagem = new Map();
for (const r of rotas) for (const p of r.firstLoadChunkPaths) contagem.set(p, (contagem.get(p) ?? 0) + 1);
const base = [...contagem.entries()].filter(([, n]) => n === rotas.length).map(([p]) => p);
const baseGz = base.reduce((a, p) => a + chunk(p).gz, 0);

const linhas = rotas.map((r) => {
  const proprios = r.firstLoadChunkPaths.filter((p) => !base.includes(p));
  const gz = r.firstLoadChunkPaths.reduce((a, p) => a + chunk(p).gz, 0);
  const libs = [...new Set(proprios.flatMap((p) => chunk(p).libs))].filter((l) => !["next", "react", "react-dom", "scheduler"].includes(l));
  return { rota: r.route, kbCru: Math.round(r.firstLoadUncompressedJsBytes / 1024), kbGzip: Math.round(gz / 1024), kbProprioGzip: Math.round((gz - baseGz) / 1024), libs };
}).sort((a, b) => b.kbGzip - a.kbGzip);

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ baseKbGzip: Math.round(baseGz / 1024), rotas: linhas }, null, 2));
} else {
  console.log(`Base que toda tela baixa: ${Math.round(baseGz / 1024)} KB gzip (${base.length} chunks)\n`);
  console.log("| Rota | JS 1ª visita (gzip) | só desta tela | cru | bibliotecas próprias |");
  console.log("|---|---:|---:|---:|---|");
  for (const l of linhas) console.log(`| \`${l.rota}\` | ${l.kbGzip} KB${l.kbGzip > 300 ? " ⚠" : ""} | ${l.kbProprioGzip} KB | ${l.kbCru} KB | ${l.libs.join(", ")} |`);
}
