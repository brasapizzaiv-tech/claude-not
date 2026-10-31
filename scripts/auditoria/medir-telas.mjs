// Auditoria — robô que mede quanto cada tela da produção demora pra abrir.
//
// Usa o Chrome já instalado (playwright-core, canal "chrome"). Só ABRE
// páginas: toda requisição que não seja GET é cortada no próprio navegador
// (server action é POST, então nenhum botão grava), menos as funções do
// banco que só leem e a renovação do login. Pedidos pra localhost (agentes de
// pinpad e balança deste PC) também são cortados.
//
//   1) node scripts/auditoria/medir-telas.mjs --login --perfil <pasta>
//      Abre a janela; o Rafael entra com o e-mail e a senha dele. A sessão fica
//      na <pasta> (fora do repositório; apagar no fim da auditoria).
//   2) node scripts/auditoria/medir-telas.mjs --perfil <pasta> --saida <arquivo.json> [--so /rota,/outra] [--vezes 3]
//      Mede cada tela 3 vezes (a 1ª com o cache do navegador limpo) e grava
//      um JSON por linha na <saida>. Telas públicas também no celular em 4G.
//   3) node scripts/auditoria/medir-telas.mjs --resumo <arquivo.json>   → tabela em markdown
import { createRequire } from "node:module";
import { appendFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { conectar } from "./db.mjs";

const require = createRequire(import.meta.url);
const BASE = process.env.AUDITORIA_BASE || "https://www.brasarestaurante.com.br";
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
const tem = (n) => process.argv.includes(n);

// ---------- 3) resumo ----------
if (tem("--resumo")) {
  const linhas = readFileSync(arg("--resumo"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const mediana = (a) => { const v = a.filter((x) => x != null).sort((x, y) => x - y); return v.length ? v[Math.floor((v.length - 1) / 2)] : null; };
  const s = (ms) => (ms == null ? "—" : `${(ms / 1000).toFixed(1).replace(".", ",")} s`);
  const porRota = new Map();
  for (const l of linhas) {
    const k = `${l.rota}${l.perfil === "celular-4g" ? " (celular 4G)" : ""}`;
    porRota.set(k, [...(porRota.get(k) ?? []), l]);
  }
  const tabela = [...porRota.entries()].map(([rota, ls]) => {
    const fria = ls.find((l) => l.vez === 1);
    const quentes = ls.filter((l) => l.vez > 1);
    const pronto = mediana(quentes.map((l) => l.prontoMs));
    const nivel = pronto == null ? "erro" : pronto <= 2000 ? "ok" : pronto <= 4000 ? "atenção" : "lenta";
    return {
      rota, nivel, pronto, prontoFria: fria?.prontoMs, ttfb: mediana(quentes.map((l) => l.ttfbMs)), lcp: mediana(quentes.map((l) => l.lcpMs)),
      rsc: mediana(quentes.map((l) => l.rscMs)), req: mediana(quentes.map((l) => l.requisicoes)), final: ls[ls.length - 1]?.urlFinal, lentos: (quentes[0] ?? fria)?.lentos ?? [],
    };
  }).sort((a, b) => (b.pronto ?? 1e9) - (a.pronto ?? 1e9));
  console.log("| Tela | Situação | Pronta (quente) | 1ª vez (fria) | Servidor (TTFB) | Maior conteúdo (LCP) | Clique no menu (RSC) | Requisições | Mais lentas |");
  console.log("|---|---|---:|---:|---:|---:|---:|---:|---|");
  for (const t of tabela) {
    const desvio = t.final && !t.final.endsWith(t.rota.replace(/ \(celular 4G\)$/, "")) ? ` → \`${t.final}\`` : "";
    console.log(`| \`${t.rota}\`${desvio} | ${t.nivel} | ${s(t.pronto)} | ${s(t.prontoFria)} | ${s(t.ttfb)} | ${s(t.lcp)} | ${s(t.rsc)} | ${t.req ?? "—"} | ${t.lentos.slice(0, 3).map((x) => `${x.nome} ${s(x.ms)}`).join("; ")} |`);
  }
  process.exit(0);
}

const perfil = arg("--perfil");
if (!perfil) throw new Error("Falta --perfil <pasta> (fora do repositório).");
const { chromium } = require("playwright-core");

// ---------- 1) login ----------
if (tem("--login")) {
  const ctx = await chromium.launchPersistentContext(perfil, { channel: "chrome", headless: false, viewport: { width: 1440, height: 900 } });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto(`${BASE}/login`);
  console.log("Janela aberta. Entre com o seu e-mail e senha. Espero até 10 minutos…");
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 600_000 });
  console.log(`Logado (${page.url()}). Fechando.`);
  await ctx.close();
  process.exit(0);
}

// ---------- 2) medir ----------
const saida = arg("--saida");
if (!saida) throw new Error("Falta --saida <arquivo.json>.");
const vezes = Number(arg("--vezes") ?? 3);

// Funções do banco que só leem (as que gravam ficam bloqueadas).
const GRAVA = String.raw`\m(insert\s+into|update\s+[a-z_."]+(\s+[a-z_]+)?\s+set|delete\s+from)\M`;
const db = await conectar();
const rpcLeitura = new Set((await db.query(
  `select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and not (p.prosrc ~* $1)`, [GRAVA],
)).rows.map((r) => r.proname));

// Telas: as do mapa de rotas. Fora: as que convidam/gravam de verdade, as de
// link pessoal (token de funcionário/fornecedor/entregador), TV (precisa da chave)
// e o que fala com aparelho deste PC.
const FORA = [/^\/cotacoes\/\[id\]\/fornecedores$/, /\[token\]/, /^\/tv(\/|$)/, /^\/balanca-teste$/, /^\/cotar\//, /^\/garcom-avulso\//];
const mapa = JSON.parse(execFileSync(process.execPath, [join(import.meta.dirname, "mapa-rotas.mjs"), "--json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }))
  .filter((r) => r.tipo === "pagina" && !FORA.some((re) => re.test(r.url)));

// Um id de exemplo (o mais recente) pra cada tela com [id] — só leitura.
const EXEMPLO = {
  "[id]": {
    "/colaboradores/[id]": "colaboradores", "/colaboradores/ponto/horarios/[id]": "ponto_horarios", "/conferencia/[id]": "pedidos",
    "/contagens/[id]": "contagens", "/contagens/[id]/atribuir": "contagens", "/cotacoes/[id]": "cotacoes", "/cotacoes/[id]/comparar": "cotacoes",
    "/cotacoes/[id]/pedidos": "cotacoes", "/delivery/[id]": "delivery_pedidos", "/pedir/acompanhar/[id]": "delivery_pedidos",
    "/delivery/campanhas/[id]": "campanhas", "/etiquetas/[id]": "etiquetas", "/e/[id]": "etiquetas", "/financeiro/caixa/[id]": "pdv_caixas",
    "/salao/caixa/movimentos/[id]": "pdv_caixas", "/notas/[id]": "notas_fiscais", "/salao/comandas/[id]": "pdv_comandas",
    "/garcom/comanda/[id]": "pdv_comandas", "/salao/cardapio/combos/[id]": "combos",
  },
  "[itemId]": { "/salao/cardapio/adicionais/[itemId]": "cardapio_itens" },
};
async function idDe(tabela) {
  for (const ordem of ["criado_em desc", "created_at desc", "id"]) {
    try { const { rows } = await db.query(`select id::text from public.${tabela} order by ${ordem} limit 1`); return rows[0]?.id ?? null; } catch { /* tenta a próxima ordem */ }
  }
  return null;
}
const telas = [];
const semExemplo = [];
for (const r of mapa) {
  let url = r.url;
  if (url.includes("[mesa]")) url = url.replace("[mesa]", "5");
  for (const [marca, tabelas] of Object.entries(EXEMPLO)) {
    if (!url.includes(marca)) continue;
    const id = tabelas[r.url] ? await idDe(tabelas[r.url]) : null;
    if (id) url = url.replace(marca, id);
  }
  if (url.includes("[")) semExemplo.push(r.url);
  else telas.push({ rota: r.url, url, publica: /público|cliente|ativação/.test(r.quem) });
}
await db.end();
if (semExemplo.length) console.log(`Sem id de exemplo (não medidas): ${semExemplo.join(", ")}`);
const so = arg("--so")?.split(",");
const alvo = so ? telas.filter((t) => so.includes(t.rota)) : telas;

const bloqueadas = [];
async function travar(ctx) {
  await ctx.route("**/*", (route) => {
    const r = route.request();
    const u = new URL(r.url());
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return route.abort();
    if (["GET", "HEAD", "OPTIONS"].includes(r.method())) return route.continue();
    if (u.pathname.startsWith("/rest/v1/rpc/") && rpcLeitura.has(u.pathname.split("/").pop())) return route.continue();
    if (u.pathname === "/auth/v1/token") return route.continue(); // renovar o login
    bloqueadas.push(`${r.method()} ${u.host}${u.pathname}`);
    return route.abort();
  });
}

async function medir(page, cdp, t, vez, perfilNome) {
  if (vez === 1) await cdp.send("Network.clearBrowserCache");
  const t0 = Date.now();
  let erro = null;
  try { await page.goto(BASE + t.url, { waitUntil: "load", timeout: 60_000 }); } catch (e) { erro = String(e.message).split("\n")[0]; }
  let prontoMs = null;
  try { await page.waitForLoadState("networkidle", { timeout: 20_000 }); prontoMs = Date.now() - t0; } catch { prontoMs = null; }
  const m = await page.evaluate(async () => {
    const nav = performance.getEntriesByType("navigation")[0];
    const lcp = await new Promise((res) => {
      let v = null;
      try { new PerformanceObserver((l) => { for (const e of l.getEntries()) v = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true }); } catch { /* sem LCP */ }
      setTimeout(() => res(v), 250);
    });
    const recursos = performance.getEntriesByType("resource").map((r) => ({ nome: r.name.replace(location.origin, "").split("?")[0].slice(0, 80), ms: Math.round(r.duration) }));
    return { ttfbMs: nav ? Math.round(nav.responseStart - nav.startTime) : null, lcpMs: lcp == null ? null : Math.round(lcp), recursos };
  }).catch(() => ({ ttfbMs: null, lcpMs: null, recursos: [] }));
  // Clique no menu: o pedido que o Next faz ao trocar de tela dentro do app.
  const rscMs = await page.evaluate(async (u) => {
    const t = performance.now();
    try { const r = await fetch(u, { headers: { RSC: "1" } }); await r.text(); return Math.round(performance.now() - t); } catch { return null; }
  }, t.url).catch(() => null);
  const lentos = [...m.recursos].sort((a, b) => b.ms - a.ms).slice(0, 5);
  const linha = {
    rota: t.rota, perfil: perfilNome, vez, urlFinal: new URL(page.url()).pathname, erro,
    prontoMs, ttfbMs: m.ttfbMs, lcpMs: m.lcpMs, rscMs, requisicoes: m.recursos.length + 1, lentos, quando: new Date().toISOString(),
  };
  appendFileSync(saida, JSON.stringify(linha) + "\n");
  return linha;
}

// Computador: logado, 1440×900.
const ctx = await chromium.launchPersistentContext(perfil, { channel: "chrome", headless: true, viewport: { width: 1440, height: 900 } });
await travar(ctx);
const page = ctx.pages()[0] ?? (await ctx.newPage());
const cdp = await ctx.newCDPSession(page);
await page.goto(`${BASE}/dashboard`);
if (new URL(page.url()).pathname.startsWith("/login")) throw new Error("Não está logado: rode antes com --login.");
for (const t of alvo) {
  for (let vez = 1; vez <= vezes; vez++) {
    const l = await medir(page, cdp, t, vez, "computador");
    console.log(`${t.rota} #${vez}: pronta ${l.prontoMs ?? "?"} ms · TTFB ${l.ttfbMs ?? "?"} · RSC ${l.rscMs ?? "?"}${l.erro ? " · ERRO " + l.erro : ""}`);
  }
}
await ctx.close();

// Celular em 4G (sem login): as telas públicas que o cliente e o entregador abrem.
if (!so || alvo.some((t) => t.publica)) {
  const cel = await chromium.launch({ channel: "chrome", headless: true });
  const c2 = await cel.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  await travar(c2);
  const p2 = await c2.newPage();
  const cdp2 = await c2.newCDPSession(p2);
  await cdp2.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  await cdp2.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  for (const t of alvo.filter((x) => x.publica)) {
    for (let vez = 1; vez <= vezes; vez++) {
      const l = await medir(p2, cdp2, t, vez, "celular-4g");
      console.log(`[4G] ${t.rota} #${vez}: pronta ${l.prontoMs ?? "?"} ms · TTFB ${l.ttfbMs ?? "?"}`);
    }
  }
  await cel.close();
}
if (bloqueadas.length) console.log(`\nCortadas pelo bloqueio (não gravaram): ${[...new Set(bloqueadas)].join(", ")}`);
if (!existsSync(saida)) console.log("Nada medido.");
