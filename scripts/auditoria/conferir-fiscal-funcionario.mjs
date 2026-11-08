// Auditoria — confere, com o login de um FUNCIONÁRIO, que a configuração fiscal
// ficou só do dono (migration 0275). SÓ LEITURA: abre telas e faz um GET na API.
// Nunca imprime token nem valor: só as CHAVES que a API devolveu.
//   node scripts/auditoria/conferir-fiscal-funcionario.mjs --perfil <pasta do funcionário>
import { createRequire } from "node:module";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../../src/lib/supabase/config.ts";

const require = createRequire(import.meta.url);
const BASE = "https://www.brasarestaurante.com.br";
const perfil = process.argv[process.argv.indexOf("--perfil") + 1];
const { chromium } = require("playwright-core");

const ctx = await chromium.launchPersistentContext(perfil, { channel: "chrome", headless: true });
await ctx.route("**/*", (r) => (["GET", "HEAD", "OPTIONS"].includes(r.request().method()) || new URL(r.request().url()).pathname === "/auth/v1/token" ? r.continue() : r.abort()));
const page = ctx.pages()[0] ?? (await ctx.newPage());
for (const rota of ["/fiscal", "/fiscal/perfis", "/formas-pagamento", "/clientes", "/salao/caixa"]) {
  await page.goto(BASE + rota, { waitUntil: "load", timeout: 45_000 }).catch(() => {});
  console.log(`${rota} → ${new URL(page.url()).pathname}`);
}
// Sessão renovada pelo navegador; o token de acesso fica só na memória deste script.
const partes = (await ctx.cookies()).filter((c) => /sb-.*-auth-token(\.\d+)?$/.test(c.name)).sort((a, b) => a.name.localeCompare(b.name));
let bruto = partes.map((c) => decodeURIComponent(c.value)).join("");
if (bruto.startsWith("base64-")) bruto = Buffer.from(bruto.slice(7), "base64").toString("utf8");
const acesso = JSON.parse(bruto).access_token;
await ctx.close();
const r = await fetch(`${SUPABASE_URL}/rest/v1/config_fiscal?select=chave`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${acesso}` } });
const chaves = (await r.json()).map((x) => x.chave).sort();
console.log(`API config_fiscal (funcionário): HTTP ${r.status} · ${chaves.length} chaves`);
for (const s of ["emissor_token", "emissor_token_homologacao", "csc"]) console.log(`  ${s}: ${chaves.includes(s) ? "AINDA VISÍVEL" : "escondido"}`);
console.log(`  outras visíveis: ${chaves.filter((c) => !["emissor_token", "emissor_token_homologacao", "csc"].includes(c)).length}`);
