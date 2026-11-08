// Auditoria — Etapa 3: "funcionário em tela de dono". SÓ LEITURA.
// Com o login de um funcionário (perfil separado), abre cada tela de dentro e
// compara: abriu × o que as permissões dele deveriam deixar (podeAcessar).
// Mesmo bloqueio do varrer-telas.mjs: só GET (e funções do banco que só leem).
//
//   node scripts/auditoria/varrer-funcionario.mjs --perfil <pasta do funcionário> --saida <arquivo.jsonl>
import { createRequire } from "node:module";
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { conectar } from "./db.mjs";
import { podeAcessar, moduloDaRota } from "../../src/lib/permissoes.ts";

const require = createRequire(import.meta.url);
const BASE = process.env.AUDITORIA_BASE || "https://www.brasarestaurante.com.br";
const HOST = new URL(BASE).hostname;
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
const perfil = arg("--perfil"), saida = arg("--saida");
if (!perfil || !saida) throw new Error("Falta --perfil e --saida.");
const { chromium } = require("playwright-core");

// Quem é: o id vem do cookie de sessão do Supabase (nunca é impresso).
const ctx0 = await chromium.launchPersistentContext(perfil, { channel: "chrome", headless: true });
const cookies = await ctx0.cookies();
await ctx0.close();
const partes = cookies.filter((c) => /sb-.*-auth-token(\.\d+)?$/.test(c.name)).sort((a, b) => a.name.localeCompare(b.name));
if (!partes.length) throw new Error("Não está logado: rode o varrer-telas.mjs --login com este perfil.");
let bruto = partes.map((c) => decodeURIComponent(c.value)).join("");
if (bruto.startsWith("base64-")) bruto = Buffer.from(bruto.slice(7), "base64").toString("utf8");
const userId = JSON.parse(bruto)?.user?.id;
if (!userId) throw new Error("Não achei o usuário na sessão.");

const db = await conectar();
const { rows: [prof] } = await db.query(`select papel, permissoes from public.profiles where id = $1`, [userId]);
const admin = prof?.papel === "dono";
const permissoes = prof?.permissoes ?? [];
console.log(`Perfil: papel ${prof?.papel ?? "?"} · ${permissoes.length} permissões (${permissoes.join(", ")})`);
if (admin) { console.log("Esse login é de dono: o teste precisa de um funcionário. Nada feito."); process.exit(0); }
const GRAVA = String.raw`\m(insert\s+into|update\s+[a-z_."]+(\s+[a-z_]+)?\s+set|delete\s+from)\M`;
const rpcLeitura = new Set((await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and not (p.prosrc ~* $1)`, [GRAVA])).rows.map((r) => r.proname));
await db.end();

const FORA = [/^\/cotacoes\/\[id\]\/fornecedores$/, /\[token\]/, /^\/tv(\/|$)/, /^\/balanca-teste$/, /^\/cotar\//, /^\/garcom-avulso\//, /\[(id|itemId|mesa)\]/];
const mapa = JSON.parse(execFileSync(process.execPath, [join(import.meta.dirname, "mapa-rotas.mjs"), "--json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).replace(/^﻿/, ""))
  .filter((r) => r.tipo === "pagina" && !FORA.some((re) => re.test(r.url)) && !/público|cliente|ativação/.test(r.quem));

const navegador = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await navegador.newContext({ viewport: { width: 1280, height: 720 }, locale: "pt-BR" });
await ctx.addCookies(cookies);
await ctx.route("**/*", (route) => {
  const r = route.request(); const u = new URL(r.url());
  if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return route.abort();
  if (u.hostname !== HOST && !u.hostname.endsWith(".supabase.co") && !/(gstatic|googleapis|google|vercel-scripts|vercel-insights)\.com$/.test(u.hostname)) return route.abort();
  if (["GET", "HEAD", "OPTIONS"].includes(r.method())) return route.continue();
  if (u.pathname.startsWith("/rest/v1/rpc/") && rpcLeitura.has(u.pathname.split("/").pop())) return route.continue();
  if (u.pathname === "/auth/v1/token") return route.continue();
  return route.abort();
});
ctx.on("page", (p) => { if (ctx.pages().length > 1) p.close().catch(() => {}); });
const page = await ctx.newPage();
page.on("dialog", (d) => d.dismiss().catch(() => {}));

let abertasSemPermissao = 0, barradasComPermissao = 0;
for (const r of mapa) {
  let final = null, status = null;
  try { const resp = await page.goto(BASE + r.url, { waitUntil: "load", timeout: 45_000 }); status = resp?.status() ?? null; final = new URL(page.url()).pathname; } catch { final = "(não abriu)"; }
  const abriu = final === r.url;
  const deveria = podeAcessar(r.url, false, permissoes);
  const modulo = moduloDaRota(r.url);
  const texto = abriu ? (await page.evaluate(() => document.querySelector("main")?.innerText ?? document.body.innerText).catch(() => "")).trim().replace(/\s+/g, " ").slice(0, 120) : "";
  const problemas = [];
  if (abriu && !deveria) { problemas.push("abriu sem ter a permissão"); abertasSemPermissao++; }
  if (!abriu && deveria && final !== "/login") { problemas.push(`não abriu tendo permissão (foi pra ${final})`); barradasComPermissao++; }
  if (abriu && modulo === null && r.url !== "/dashboard") problemas.push("rota sem módulo: qualquer funcionário logado abre");
  appendFileSync(saida, JSON.stringify({ fase: "funcionário", rota: r.url, modulo, deveria, abriu, final, status, texto, problemas }) + "\n");
  console.log(`${r.url} [${modulo ?? "livre"}] ${abriu ? "ABRIU" : "barrada → " + final}${problemas.length ? " · " + problemas.join("; ") : ""}`);
}
await navegador.close();
console.log(`\n${mapa.length} telas · abertas sem permissão: ${abertasSemPermissao} · barradas tendo permissão: ${barradasComPermissao}`);
