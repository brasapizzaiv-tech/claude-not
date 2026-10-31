// Auditoria — mapa de rotas (só leitura).
// Varre src/app, lista cada página e rota de API com: endereço, quem acessa,
// título, se é componente de cliente, se força dinâmico, se usa a chave
// administrativa e quantas consultas ao banco aparecem no arquivo da página.
//
//   node scripts/auditoria/mapa-rotas.mjs            → tabela em markdown
//   node scripts/auditoria/mapa-rotas.mjs --json     → JSON (usado pela etapa 1)
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { moduloDaRota } from "../../src/lib/permissoes.ts";

const RAIZ = join(import.meta.dirname, "..", "..");
const APP = join(RAIZ, "src", "app");

function andar(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) andar(p, out);
    else if (n === "page.tsx" || n === "route.ts") out.push(p);
  }
  return out;
}

const urlDe = (arq) =>
  "/" +
  relative(APP, arq)
    .split(sep)
    .slice(0, -1)
    .filter((s) => !/^\(.*\)$/.test(s))
    .join("/");

function quem(url, grupo) {
  if (grupo === "(painel)") {
    const m = moduloDaRota(url);
    if (m === "usuarios") return "dono";
    return m ? `logado · permissão ${m}` : "logado (qualquer)";
  }
  if (grupo === "(garcom)") return "logado · permissão garcom (ou link do garçom)";
  if (url.startsWith("/eu/")) return "funcionário · link com token";
  if (url.startsWith("/entrega/")) return "entregador · link com token";
  if (url === "/entrega") return "entregador · ativação do app";
  if (url.startsWith("/contar/")) return "funcionário · link com token";
  if (url.startsWith("/cotar")) return "fornecedor · link com token";
  if (url.startsWith("/folga/")) return "funcionário · link com token";
  if (url.startsWith("/garcom-avulso/")) return "garçom avulso · link com token";
  if (url.startsWith("/tv")) return "TV · chave na URL";
  if (url.startsWith("/pedir")) return "cliente · público";
  if (url.startsWith("/motelli")) return "público (site da marca)";
  if (url === "/login") return "público";
  return "?";
}

function ler(arq) {
  const s = readFileSync(arq, "utf8");
  const titulo = (s.match(/title:\s*["'`]([^"'`]+)["'`]/) || [])[1] ?? "";
  const comentario = (s.match(/^\s*\/\/\s*(.+)$/m) || [])[1] ?? "";
  return {
    linhas: s.split("\n").length,
    titulo: titulo.replace(/ · Brasa$/, ""),
    comentario: comentario.slice(0, 110),
    cliente: /^["']use client["']/m.test(s.slice(0, 200)),
    forceDynamic: /force-dynamic/.test(s),
    revalidate: (s.match(/export const revalidate\s*=\s*(\w+)/) || [])[1] ?? "",
    admin: /createAdminClient|supabaseAdmin\(/.test(s),
    exigirAcesso: /exigirAcesso\(/.test(s),
    consultas: (s.match(/\.(from|rpc)\(/g) || []).length,
    metodos: [...s.matchAll(/export (?:async )?function (GET|POST|PUT|PATCH|DELETE)\b/g)].map((m) => m[1]),
    cronSecret: /CRON_SECRET/.test(s),
  };
}

const itens = andar(APP).map((arq) => {
  const rel = relative(APP, arq).split(sep);
  const grupo = rel[0].startsWith("(") ? rel[0] : "";
  const url = urlDe(arq);
  const tipo = arq.endsWith("route.ts") ? "api" : "pagina";
  return { url, tipo, grupo, quem: tipo === "pagina" ? quem(url, grupo) : "", arquivo: relative(RAIZ, arq).split(sep).join("/"), ...ler(arq) };
});
itens.sort((a, b) => a.url.localeCompare(b.url));

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(itens, null, 1));
} else {
  const pag = itens.filter((i) => i.tipo === "pagina");
  const api = itens.filter((i) => i.tipo === "api");
  console.log(`Páginas: ${pag.length} · rotas de API/arquivo: ${api.length}\n`);
  console.log("| Rota | Quem acessa | Título | Cliente? | force-dynamic | admin | consultas no arquivo | linhas |");
  console.log("|---|---|---|---|---|---|---|---|");
  for (const i of pag) console.log(`| \`${i.url}\` | ${i.quem} | ${i.titulo || "—"} | ${i.cliente ? "sim" : ""} | ${i.forceDynamic ? "sim" : ""} | ${i.admin ? "sim" : ""} | ${i.consultas} | ${i.linhas} |`);
  console.log("\n| Rota | Métodos | CRON_SECRET | admin | Comentário |");
  console.log("|---|---|---|---|---|");
  for (const i of api) console.log(`| \`${i.url}\` | ${i.metodos.join(", ")} | ${i.cronSecret ? "sim" : ""} | ${i.admin ? "sim" : ""} | ${i.comentario} |`);
}
