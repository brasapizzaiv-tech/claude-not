// Auditoria — Etapa 3: varredura de todas as telas da produção. SÓ LEITURA.
//
// Igual ao medir-telas.mjs: usa o Chrome instalado e corta no navegador toda
// requisição que não seja GET (server action é POST: nenhum botão grava), menos as
// funções do banco que só leem e a renovação do login. Também corta localhost
// (pinpad e balança deste PC), sites de fora e janelas novas (WhatsApp, etc.).
//
//   1) node scripts/auditoria/varrer-telas.mjs --login --perfil <pasta>
//      Abre a janela; o Rafael entra com o e-mail e a senha dele.
//   2) node scripts/auditoria/varrer-telas.mjs --perfil <pasta> --saida <arquivo.jsonl> --prints <pasta> [--so /rota,/outra]
//      Cada tela em 3 tamanhos × 2 temas; depois sem login; depois links com token
//      inválido; depois os cliques seguros. Prints só do que deu problema.
//   3) node scripts/auditoria/varrer-telas.mjs --resumo <arquivo.jsonl>
import { createRequire } from "node:module";
import { appendFileSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { conectar } from "./db.mjs";

const require = createRequire(import.meta.url);
const BASE = process.env.AUDITORIA_BASE || "https://www.brasarestaurante.com.br";
const HOST = new URL(BASE).hostname;
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
const tem = (n) => process.argv.includes(n);

// ---------- 3) resumo ----------
if (tem("--resumo")) {
  const linhas = readFileSync(arg("--resumo"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const porRota = new Map();
  for (const l of linhas) porRota.set(l.rota, [...(porRota.get(l.rota) ?? []), l]);
  console.log("| Tela | Situação | O que apareceu |");
  console.log("|---|---|---|");
  for (const [rota, ls] of [...porRota].sort()) {
    const probs = [...new Set(ls.flatMap((l) => (l.problemas ?? []).map((p) => `${p}${l.fase === "tela" ? ` (${l.tamanho} ${l.tema})` : l.fase ? ` (${l.fase})` : ""}`)))];
    console.log(`| \`${rota}\` | ${probs.length ? "problemas" : "ok"} | ${probs.slice(0, 6).join("; ").replace(/\|/g, "/")}${probs.length > 6 ? ` … +${probs.length - 6}` : ""} |`);
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
  console.log("Janela aberta. Entre com o seu e-mail e senha. Espero até 15 minutos…");
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 900_000 });
  console.log(`Logado (${page.url()}). Fechando.`);
  await ctx.close();
  process.exit(0);
}

// ---------- 2) varrer ----------
const saida = arg("--saida");
const pastaPrints = arg("--prints");
if (!saida || !pastaPrints) throw new Error("Falta --saida <arquivo.jsonl> e --prints <pasta>.");
mkdirSync(pastaPrints, { recursive: true });
const gravar = (l) => appendFileSync(saida, JSON.stringify({ ...l, quando: new Date().toISOString() }) + "\n");

const GRAVA = String.raw`\m(insert\s+into|update\s+[a-z_."]+(\s+[a-z_]+)?\s+set|delete\s+from)\M`;
const db = await conectar();
const rpcLeitura = new Set((await db.query(
  `select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and not (p.prosrc ~* $1)`, [GRAVA],
)).rows.map((r) => r.proname));

// Fora: as que convidam/gravam de verdade, links pessoais com token real, TV (chave),
// e a página de teste da balança. Tokens e TV entram depois, só com valor inválido.
const FORA = [/^\/cotacoes\/\[id\]\/fornecedores$/, /\[token\]/, /^\/tv(\/|$)/, /^\/balanca-teste$/, /^\/cotar\//, /^\/garcom-avulso\//];
const mapaTodo = JSON.parse(execFileSync(process.execPath, [join(import.meta.dirname, "mapa-rotas.mjs"), "--json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).replace(/^﻿/, ""));
const mapa = mapaTodo.filter((r) => r.tipo === "pagina" && !FORA.some((re) => re.test(r.url)));
const comToken = mapaTodo.filter((r) => r.tipo === "pagina" && (/\[token\]/.test(r.url) || /^\/tv(\/|$)/.test(r.url)));

const EXEMPLO = {
  "/colaboradores/[id]": "colaboradores", "/colaboradores/ponto/horarios/[id]": "ponto_horarios", "/conferencia/[id]": "pedidos",
  "/contagens/[id]": "contagens", "/contagens/[id]/atribuir": "contagens", "/cotacoes/[id]": "cotacoes", "/cotacoes/[id]/comparar": "cotacoes",
  "/cotacoes/[id]/pedidos": "cotacoes", "/delivery/[id]": "delivery_pedidos", "/pedir/acompanhar/[id]": "delivery_pedidos",
  "/delivery/campanhas/[id]": "wpp_campanhas", "/etiquetas/[id]": "etiquetas", "/e/[id]": "etiquetas", "/financeiro/caixa/[id]": "fechamentos_caixa",
  "/salao/caixa/movimentos/[id]": "select id::text from public.pdv_caixa_mov where tipo = 'venda' order by criado_em desc limit 1", "/notas/[id]": "notas_fiscais", "/salao/comandas/[id]": "pdv_comandas",
  "/garcom/comanda/[id]": "pdv_comandas", "/salao/cardapio/adicionais/[itemId]": "cardapio_itens",
  // Combo é um item do cardápio que tem grupos de escolha.
  "/salao/cardapio/combos/[id]": "select distinct item_id::text as id from public.pdv_item_grupos limit 1",
};
async function idDe(tabela) {
  if (tabela.startsWith("select ")) { try { return (await db.query(tabela)).rows[0]?.id ?? null; } catch { return null; } }
  for (const ordem of ["criado_em desc", "created_at desc", "id"]) {
    try { const { rows } = await db.query(`select id::text from public.${tabela} order by ${ordem} limit 1`); return rows[0]?.id ?? null; } catch { /* próxima */ }
  }
  return null;
}
const telas = [];
for (const r of mapa) {
  let url = r.url.replace("[mesa]", "5");
  if (/\[(id|itemId)\]/.test(url) && EXEMPLO[r.url]) { const id = await idDe(EXEMPLO[r.url]); if (id) url = url.replace(/\[(id|itemId)\]/, id); }
  if (url.includes("[")) { gravar({ rota: r.url, fase: "tela", problemas: ["sem id de exemplo: não aberta"] }); continue; }
  telas.push({ rota: r.url, url, publica: /público|cliente|ativação/.test(r.quem) });
}
await db.end();
const so = arg("--so")?.split(",");
const alvo = so ? telas.filter((t) => so.includes(t.rota)) : telas;

const cortadas = new Set();
async function travar(ctx) {
  ctx.on("page", (p) => { if (ctx.pages().length > 1) p.close().catch(() => {}); });
  await ctx.route("**/*", (route) => {
    const r = route.request();
    const u = new URL(r.url());
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return route.abort("blockedbyclient");
    const nosso = u.hostname === HOST || u.hostname.endsWith(".supabase.co") || u.hostname.endsWith("vercel-insights.com") || u.hostname.endsWith("vercel-scripts.com")
      || /(^|\.)(gstatic|googleapis|google)\.com$/.test(u.hostname) || /(^|\.)openstreetmap\.org$/.test(u.hostname) || u.hostname.endsWith("unpkg.com") || u.hostname.endsWith("jsdelivr.net");
    if (!nosso) { cortadas.add(`${r.method()} ${u.hostname}`); return route.abort("blockedbyclient"); }
    if (["GET", "HEAD", "OPTIONS"].includes(r.method())) return route.continue();
    if (u.pathname.startsWith("/rest/v1/rpc/") && rpcLeitura.has(u.pathname.split("/").pop())) return route.continue();
    if (u.pathname === "/auth/v1/token") return route.continue();
    cortadas.add(`${r.method()} ${u.host}${u.pathname}`);
    return route.abort("blockedbyclient");
  });
}

// Coleta de erros da página (console, exceção, requisição que falhou de verdade).
function escutar(page) {
  const ev = { console: [], excecoes: [], falhas: [] };
  page.on("console", (m) => {
    const t = m.text();
    if (m.type() === "error" || /hydrat/i.test(t)) ev.console.push(t.slice(0, 220));
  });
  page.on("pageerror", (e) => ev.excecoes.push(String(e.message).slice(0, 220)));
  page.on("response", (r) => { const u = new URL(r.url()); if (r.status() >= 400 && !u.pathname.startsWith("/_vercel")) ev.falhas.push(`${r.status()} ${u.pathname}`.slice(0, 160)); });
  page.on("requestfailed", (r) => { const f = r.failure()?.errorText ?? ""; if (!/BLOCKED_BY_CLIENT|ERR_ABORTED/i.test(f)) ev.falhas.push(`${f} ${new URL(r.url()).pathname}`.slice(0, 160)); });
  page.on("dialog", (d) => d.dismiss().catch(() => {}));
  return ev;
}
const limparEv = (ev) => { ev.console.length = 0; ev.excecoes.length = 0; ev.falhas.length = 0; };
// Erro causado pelo nosso próprio bloqueio (POST cortado) não é problema da tela.
const doBloqueio = (t) => /Failed to fetch|NetworkError|net::ERR_BLOCKED_BY_CLIENT|blockedbyclient|localhost:85|ERR_FAILED/i.test(t);

// Medições de layout, dentro da página.
async function layout(page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const out = { rolagemLateral: 0, foraDaTela: [], cortados: [], baixoContraste: [], alvosPequenos: 0, modalMaior: [] };
    const doc = document.scrollingElement || document.documentElement;
    if (doc.scrollWidth > vw + 2) out.rolagemLateral = doc.scrollWidth - vw;
    const visivel = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0.05; };
    const rolaX = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === "auto" || o === "scroll" || o === "hidden") return true; } return false; };
    const nome = (el) => (el.innerText || el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.tagName).trim().replace(/\s+/g, " ").slice(0, 40);
    for (const el of document.querySelectorAll("button, a[href], input, select, textarea")) {
      if (!visivel(el)) continue;
      const r = el.getBoundingClientRect();
      if ((r.right > vw + 2 || r.left < -2) && !rolaX(el)) out.foraDaTela.push(nome(el));
      if (vw < 500 && (r.height < 40 || r.width < 40) && el.tagName !== "INPUT" && el.tagName !== "A") out.alvosPequenos++;
    }
    // Texto cortado: caixa com overflow escondido e conteúdo maior, sem reticências.
    for (const el of document.querySelectorAll("body *")) {
      if (out.cortados.length >= 8) break;
      if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
      const s = getComputedStyle(el);
      if (!["hidden", "clip"].includes(s.overflowX) && !["hidden", "clip"].includes(s.overflow)) continue;
      if (s.textOverflow === "ellipsis" || /line-clamp/.test(el.className?.toString?.() ?? "") || s.webkitLineClamp !== "none") continue;
      if (el.scrollWidth > el.clientWidth + 2 && visivel(el)) out.cortados.push(nome(el));
    }
    // Contraste do texto contra o fundo de verdade (sobe até achar cor de fundo).
    const rgb = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 }; };
    const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const fundo = (el) => { for (let p = el; p; p = p.parentElement) { const c = rgb(getComputedStyle(p).backgroundColor); if (c && c.a > 0.5) return c; if (getComputedStyle(p).backgroundImage !== "none") return null; } return rgb(getComputedStyle(document.body).backgroundColor); };
    let vistos = 0;
    for (const el of document.querySelectorAll("body *")) {
      if (vistos > 600 || out.baixoContraste.length >= 8) break;
      if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1) || !visivel(el)) continue;
      vistos++;
      const s = getComputedStyle(el); const cor = rgb(s.color); const bg = fundo(el);
      if (!cor || !bg || cor.a < 0.5) continue;
      const a = lum(cor), b = lum(bg); const ct = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      const grande = parseFloat(s.fontSize) >= 24 || (parseFloat(s.fontSize) >= 18.6 && Number(s.fontWeight) >= 700);
      if (ct < (grande ? 3 : 4.5) && !el.closest("[disabled],[aria-disabled=true]")) out.baixoContraste.push(`${nome(el)} (${ct.toFixed(1)}:1)`);
    }
    for (const el of document.querySelectorAll("[role=dialog], dialog[open], .fixed.inset-0 > *")) {
      if (!visivel(el)) continue; const r = el.getBoundingClientRect();
      if (r.height > window.innerHeight + 2 && getComputedStyle(el).overflowY === "visible") out.modalMaior.push(nome(el));
    }
    return out;
  });
}

const slug = (s) => s.replace(/^\//, "").replace(/[^\w-]+/g, "_").replace(/_+/g, "_").slice(0, 70) || "raiz";
async function printar(page, rota, extra) {
  const f = join(pastaPrints, `${slug(rota)}__${extra}.png`);
  await page.screenshot({ path: f, fullPage: true, timeout: 20_000 }).catch(() => {});
  return f;
}

function problemasDe(ev, lay) {
  const p = [];
  const cons = ev.console.filter((t) => !doBloqueio(t));
  if (cons.length) p.push(`console: ${[...new Set(cons)].slice(0, 2).join(" · ")}`);
  if (ev.excecoes.filter((t) => !doBloqueio(t)).length) p.push(`exceção: ${[...new Set(ev.excecoes)].slice(0, 2).join(" · ")}`);
  if (ev.falhas.length) p.push(`requisição falhou: ${[...new Set(ev.falhas)].slice(0, 3).join(" · ")}`);
  if (lay) {
    if (lay.rolagemLateral) p.push(`rolagem lateral de ${lay.rolagemLateral}px`);
    if (lay.foraDaTela.length) p.push(`fora da tela: ${[...new Set(lay.foraDaTela)].slice(0, 4).join(", ")}`);
    if (lay.cortados.length) p.push(`texto cortado: ${[...new Set(lay.cortados)].slice(0, 3).join(", ")}`);
    if (lay.baixoContraste.length) p.push(`contraste baixo: ${[...new Set(lay.baixoContraste)].slice(0, 3).join(", ")}`);
    if (lay.modalMaior.length) p.push(`janela maior que a tela: ${lay.modalMaior.slice(0, 2).join(", ")}`);
  }
  return p;
}

const TAMANHOS = [
  { nome: "computador", viewport: { width: 1440, height: 900 } },
  { nome: "notebook", viewport: { width: 1280, height: 720 } },
  { nome: "celular", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
];
// Telas especiais ganham o tamanho delas também.
const ESPECIAIS = { "/cozinha": [{ nome: "tablet", viewport: { width: 1024, height: 768 }, hasTouch: true }], "/salao/balanca/quiosque": [{ nome: "tablet", viewport: { width: 1024, height: 768 }, hasTouch: true }], "/rodizio": [{ nome: "tablet", viewport: { width: 1024, height: 768 }, hasTouch: true }] };

// ---- A) cada tela, 3 tamanhos × 2 temas, logado ----
const base = await chromium.launchPersistentContext(perfil, { channel: "chrome", headless: true, viewport: { width: 1440, height: 900 } });
const cookies = await base.cookies();
await base.close();
if (!cookies.some((c) => /sb-.*-auth-token/.test(c.name))) throw new Error("Não está logado: rode antes com --login.");
const navegador = await chromium.launch({ channel: "chrome", headless: true });
const fases = (arg("--fases") ?? "telas,semlogin,tokens,cliques").split(",");

if (fases.includes("telas")) {
  for (const tam of TAMANHOS.concat([{ nome: "tablet" }])) {
    for (const tema of ["claro", "escuro"]) {
      const lista = tam.nome === "tablet" ? alvo.filter((t) => ESPECIAIS[t.rota]) : alvo;
      if (!lista.length) continue;
      const cfg = tam.nome === "tablet" ? ESPECIAIS[lista[0].rota][0] : tam;
      const ctx = await navegador.newContext({ viewport: cfg.viewport, isMobile: !!cfg.isMobile, hasTouch: !!cfg.hasTouch, deviceScaleFactor: cfg.deviceScaleFactor ?? 1, colorScheme: tema === "escuro" ? "dark" : "light", locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
      await ctx.addCookies(cookies.concat([{ name: "tema", value: tema, domain: HOST, path: "/" }]));
      await travar(ctx);
      const page = await ctx.newPage();
      const ev = escutar(page);
      for (const t of lista) {
        limparEv(ev);
        let erro = null;
        try { await page.goto(BASE + t.url, { waitUntil: "load", timeout: 60_000 }); await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {}); } catch (e) { erro = String(e.message).split("\n")[0]; }
        await page.waitForTimeout(400);
        const final = new URL(page.url()).pathname;
        const temaReal = await page.evaluate(() => document.documentElement.classList.contains("dark") || document.documentElement.dataset.theme === "escuro" || document.documentElement.dataset.tema === "escuro").catch(() => null);
        const lay = await layout(page).catch(() => null);
        const problemas = problemasDe(ev, lay);
        if (erro) problemas.unshift(`não abriu: ${erro}`);
        if (final.startsWith("/login") && !t.publica) problemas.unshift("caiu no login (perfil sem acesso?)");
        let print = null;
        if (problemas.length) print = await printar(page, t.rota, `${tam.nome}-${tema}`);
        gravar({ fase: "tela", rota: t.rota, url: t.url, tamanho: tam.nome, tema, temaEscuroAplicado: temaReal, final, problemas, alvosPequenos: lay?.alvosPequenos ?? null, print });
        console.log(`[${tam.nome} ${tema}] ${t.rota}: ${problemas.length ? problemas.join(" | ").slice(0, 200) : "ok"}`);
      }
      await ctx.close();
    }
  }
}

// ---- B) sem login: tela de dentro tem que mandar pro login ----
if (fases.includes("semlogin")) {
  const ctx = await navegador.newContext({ viewport: { width: 1280, height: 720 }, locale: "pt-BR" });
  await travar(ctx);
  const page = await ctx.newPage();
  const ev = escutar(page);
  for (const t of alvo) {
    limparEv(ev);
    let status = null;
    try { const r = await page.goto(BASE + t.url, { waitUntil: "load", timeout: 45_000 }); status = r?.status() ?? null; } catch { /* registra abaixo */ }
    const final = new URL(page.url()).pathname;
    const problemas = [];
    if (!t.publica && !final.startsWith("/login")) problemas.push(`abriu sem login (ficou em ${final}, HTTP ${status})`);
    if (status && status >= 500) problemas.push(`HTTP ${status} sem login`);
    const ex = ev.excecoes.filter((x) => !doBloqueio(x));
    if (ex.length) problemas.push(`exceção sem login: ${ex[0]}`);
    let print = null;
    if (problemas.length) print = await printar(page, t.rota, "sem-login");
    gravar({ fase: "sem login", rota: t.rota, final, status, problemas, print });
    console.log(`[sem login] ${t.rota}: ${problemas.length ? problemas.join(" | ") : "ok"}`);
  }
  await ctx.close();
}

// ---- C) links com token/chave inválidos ----
if (fases.includes("tokens")) {
  const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "pt-BR" });
  await travar(ctx);
  const page = await ctx.newPage();
  const ev = escutar(page);
  for (const r of comToken) {
    limparEv(ev);
    const url = r.url.replace("[token]", "token-invalido-auditoria").replace("[id]", "00000000-0000-0000-0000-000000000000") + (/^\/tv/.test(r.url) ? "?chave=chave-invalida-auditoria" : "");
    let status = null;
    try { const resp = await page.goto(BASE + url, { waitUntil: "load", timeout: 45_000 }); status = resp?.status() ?? null; await page.waitForTimeout(600); } catch { /* abaixo */ }
    const texto = (await page.evaluate(() => document.body?.innerText ?? "").catch(() => "")).trim().slice(0, 300);
    const problemas = [];
    if (status && status >= 500) problemas.push(`HTTP ${status} com token inválido`);
    if (!texto) problemas.push("tela em branco com token inválido");
    const ex = ev.excecoes.filter((x) => !doBloqueio(x));
    if (ex.length) problemas.push(`exceção: ${ex[0]}`);
    const cons = ev.console.filter((x) => !doBloqueio(x));
    if (cons.length) problemas.push(`console: ${cons[0]}`);
    let print = null;
    if (problemas.length) print = await printar(page, r.url, "token-invalido");
    gravar({ fase: "token inválido", rota: r.url, status, texto: texto.slice(0, 140), problemas, print });
    console.log(`[token inválido] ${r.url}: HTTP ${status} · ${problemas.length ? problemas.join(" | ") : "ok"} · "${texto.slice(0, 60).replace(/\s+/g, " ")}"`);
  }
  await ctx.close();
}

// ---- D) cliques seguros: abre, confere, fecha (computador, claro) ----
if (fases.includes("cliques")) {
  const SEGURO = /^(\+|novo|nova|adicionar|ver |ver$|detalhes|editar|abrir|mais|histórico|filtr|buscar|mostrar|selecionar|escolher|configurar)/i;
  const PERIGO = /(exclu|apag|remov|cancel|envi|emit|confirm|salv|pag|receb|fech|imprim|public|desativ|zer|finaliz|gerar|baixar|sair|desfaz|aprov|rejeit|marcar|dar baixa|lan[cç]ar|cobrar|passar|mostrar qr|transfer|juntar|dividir|reabr|encerr|ativar|whatsapp|ligar|desligar)/i;
  const ctx = await navegador.newContext({ viewport: { width: 1440, height: 900 }, locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
  await ctx.addCookies(cookies.concat([{ name: "tema", value: "claro", domain: HOST, path: "/" }]));
  await travar(ctx);
  const page = await ctx.newPage();
  const ev = escutar(page);
  for (const t of alvo) {
    try { await page.goto(BASE + t.url, { waitUntil: "load", timeout: 45_000 }); await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {}); } catch { continue; }
    const botoes = await page.$$("main button:not([disabled]), main [role=button]");
    const feitos = [];
    const problemas = [];
    for (const b of botoes) {
      if (feitos.length >= 6) break;
      const txt = ((await b.innerText().catch(() => "")) || (await b.getAttribute("aria-label").catch(() => "")) || "").trim().replace(/\s+/g, " ");
      const tipo = await b.getAttribute("type").catch(() => null);
      if (!txt || !SEGURO.test(txt) || PERIGO.test(txt) || tipo === "submit" || !(await b.isVisible().catch(() => false))) continue;
      limparEv(ev);
      const antes = page.url();
      await b.click({ timeout: 3_000 }).catch(() => {});
      await page.waitForTimeout(700);
      const lay = await layout(page).catch(() => null);
      const p = problemasDe(ev, lay).filter((x) => !/contraste baixo|texto cortado/.test(x));
      if (p.length) { problemas.push(`depois de "${txt.slice(0, 30)}": ${p.join("; ")}`); await printar(page, t.rota, `clique-${slug(txt).slice(0, 20)}`); }
      feitos.push(txt.slice(0, 30));
      await page.keyboard.press("Escape").catch(() => {});
      await page.waitForTimeout(250);
      if (page.url() !== antes) { await page.goto(antes, { waitUntil: "load", timeout: 30_000 }).catch(() => {}); break; }
    }
    gravar({ fase: "cliques", rota: t.rota, cliques: feitos, problemas });
    if (feitos.length) console.log(`[cliques] ${t.rota}: ${feitos.join(", ")}${problemas.length ? " → " + problemas.join(" | ").slice(0, 200) : " · ok"}`);
  }
  await ctx.close();
}

await navegador.close();
console.log(`\nCortadas pelo bloqueio (não saíram): ${[...cortadas].slice(0, 40).join(", ") || "nenhuma"}`);
