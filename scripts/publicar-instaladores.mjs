// Sobe os instaladores dos agentes pro bucket privado "instaladores" (migration
// 0285), de onde a página Central de Impressões → Downloads entrega o link.
// Rode depois de gerar (installer-*/build.ps1):
//   node scripts/publicar-instaladores.mjs
// Usa a chave administrativa do .env.local (nunca imprime). Substitui o arquivo
// de mesmo nome e grava a versão (do .iss) nos metadados.
import { createRequire } from "node:module";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(RAIZ, "package.json"));
require("dotenv").config({ path: join(RAIZ, ".env.local"), quiet: true });
const { createClient } = require("@supabase/supabase-js");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !chave) throw new Error("Falta NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY no .env.local.");
const db = createClient(url, chave, { auth: { persistSession: false } });

const AGENTES = [
  { pasta: "installer-impressao", iss: "impressao.iss", arquivo: "AgenteImpressao-Setup.exe" },
  { pasta: "installer-balanca", iss: "balanca.iss", arquivo: "AgenteBalanca-Setup.exe" },
  { pasta: "installer-tef", iss: "tef.iss", arquivo: "AgenteTEF-Setup.exe" },
];

const indice = {};
for (const a of AGENTES) {
  const exe = join(RAIZ, a.pasta, "Output", a.arquivo);
  if (!existsSync(exe)) { console.log(`- ${a.arquivo}: não gerado (rode ${a.pasta}/build.ps1)`); continue; }
  const versao = (readFileSync(join(RAIZ, a.pasta, a.iss), "utf8").match(/#define AppVer "([^"]+)"/) || [])[1] ?? "?";
  const { error } = await db.storage.from("instaladores").upload(a.arquivo, readFileSync(exe), {
    upsert: true,
    contentType: "application/vnd.microsoft.portable-executable",
    metadata: { versao },
  });
  const mb = (statSync(exe).size / 1024 / 1024).toFixed(1);
  console.log(error ? `✗ ${a.arquivo}: ${error.message}` : `✓ ${a.arquivo} ${versao} (${mb} MB)`);
  if (!error) indice[a.arquivo] = { versao, mb: Number(mb), em: new Date().toISOString() };
}
// Índice que a página lê (versão, tamanho e quando subiu cada um).
const { data: velho } = await db.storage.from("instaladores").download("versoes.json");
const anterior = velho ? JSON.parse(await velho.text()) : {};
const { error: eIdx } = await db.storage.from("instaladores").upload("versoes.json", JSON.stringify({ ...anterior, ...indice }, null, 2), { upsert: true, contentType: "application/json" });
console.log(eIdx ? `✗ versoes.json: ${eIdx.message}` : "✓ versoes.json");
