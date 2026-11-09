// Auditoria — Etapa 7: acessibilidade das telas da produção com o axe-core. SÓ LEITURA.
//
// Mesmas travas do varrer-telas.mjs: Chrome instalado, toda requisição que não seja GET
// é cortada no navegador (menos as funções do banco que só leem e a renovação do login),
// localhost e sites de fora também. Não guarda HTML da página (pode ter nome de cliente):
// só a regra, o impacto, o seletor e o resumo do axe.
//
//   node scripts/auditoria/acessibilidade.mjs --perfil <pasta> --saida <arquivo.jsonl> [--so /rota,/outra]
//   node scripts/auditoria/acessibilidade.mjs --resumo <arquivo.jsonl>
import { createRequire } from "node:module";
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { conectar } from "./db.mjs";

const require = createRequire(import.meta.url);
const BASE = process.env.AUDITORIA_BASE || "https://www.brasarestaurante.com.br";
const HOST = new URL(BASE).hostname;
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
const tem = (n) => process.argv.includes(n);

// ---------- resumo ----------
if (tem("--resumo")) {
  const linhas = readFileSync(arg("--resumo"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const telas = linhas.filter((l) => l.fase === "axe");
  const porRegra = new Map();
  for (const l of telas) for (const v of l.violacoes ?? []) {
    const k = v.id;
    const g = porRegra.get(k) ?? { id: k, impacto: v.impacto, ajuda: v.ajuda, telas: new Set(), nos: 0, combos: new Set(), exemplos: [] };
    g.telas.add(l.rota); g.combos.add(l.combo); g.nos += v.nos;
    if (g.exemplos.length < 6) g.exemplos.push(`${l.rota} → ${v.alvos[0] ?? ""}`);
    porRegra.set(k, g);
  }
  const ordem = { critical: 0, serious: 1, moderate: 2, minor: 3 };
  console.log(`Telas × combinações medidas: ${telas.length} (${new Set(telas.map((t) => t.rota)).size} telas)`);
  console.log(`Sem nenhuma violação: ${telas.filter((t) => !(t.violacoes ?? []).length).length}`);
  console.log("\n| Regra | Impacto | Telas | Elementos | Combinações | O que é |\n|---|---|---|---|---|---|");
  for (const g of [...porRegra.values()].sort((a, b) => (ordem[a.impacto] - ordem[b.impacto]) || b.telas.size - a.telas.size))
    console.log(`| \`${g.id}\` | ${g.impacto} | ${g.telas.size} | ${g.nos} | ${[...g.combos].join(", ")} | ${g.ajuda} |`);
  console.log("\nExemplos por regra:");
  for (const g of porRegra.values()) console.log(`- ${g.id}: ${g.exemplos.join(" · ")}`);
  const tec = linhas.filter((l) => l.fase === "teclado");
  const semIndicador = tec.filter((t) => t.semIndicador > 0), invisivel = tec.filter((t) => t.invisiveis > 0);
  console.log(`\nTeclado (Tab até 30 vezes, computador claro): ${tec.length} telas`);
  console.log(`- foco sem indicador visível: ${semIndicador.length} telas (${semIndicador.reduce((s, t) => s + t.semIndicador, 0)} elementos) ${semIndicador.slice(0, 12).map((t) => `${t.rota} [${t.exSemIndicador.join("; ")}]`).join(" · ")}`);
  console.log(`- foco em elemento invisível/fora da tela: ${invisivel.length} telas ${invisivel.slice(0, 12).map((t) => `${t.rota} [${t.exInvisiveis.join("; ")}]`).join(" · ")}`);
  console.log(`- não chega ao conteúdo (todos os Tab ficaram no menu): ${tec.filter((t) => t.soMenu).map((t) => t.rota).join(", ") || "nenhuma"}`);
  const sem = linhas.filter((l) => l.fase === "axe" && l.combo === "computador-claro");
  console.log(`\nPáginas sem <h1>: ${sem.filter((t) => t.h1 === 0).length}; com mais de um <h1>: ${sem.filter((t) => t.h1 > 1).length}; sem lang pt-BR: ${sem.filter((t) => !/^pt/i.test(t.lang ?? "")).length}`);
  const titulos = new Map(); for (const t of sem) titulos.set(t.titulo, [...(titulos.get(t.titulo) ?? []), t.rota]);
  console.log(`Títulos de aba distintos: ${titulos.size} para ${sem.length} telas. Mais repetidos: ${[...titulos].sort((a, b) => b[1].length - a[1].length).slice(0, 5).map(([k, v]) => `"${k}" ×${v.length}`).join(", ")}`);
  process.exit(0);
}

const perfil = arg("--perfil");
const saida = arg("--saida");
if (!perfil || !saida) throw new Error("Falta --perfil <pasta> e --saida <arquivo.jsonl> (fora do repositório).");
const { chromium } = require("playwright-core");
const axeFonte = require("axe-core").source;
const gravar = (l) => appendFileSync(saida, JSON.stringify({ ...l, quando: new Date().toISOString() }) + "\n");

const GRAVA = String.raw`\m(insert\s+into|update\s+[a-z_."]+(\s+[a-z_]+)?\s+set|delete\s+from)\M`;
const db = await conectar();
const rpcLeitura = new Set((await db.query(
  `select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and not (p.prosrc ~* $1)`, [GRAVA],
)).rows.map((r) => r.proname));
const FORA = [/^\/cotacoes\/\[id\]\/fornecedores$/, /\[token\]/, /^\/tv(\/|$)/, /^\/balanca-teste$/, /^\/cotar\//, /^\/garcom-avulso\//];
const mapaTodo = JSON.parse(execFileSync(process.execPath, [join(import.meta.dirname, "mapa-rotas.mjs"), "--json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).replace(/^﻿/, ""));
const mapa = mapaTodo.filter((r) => r.tipo === "pagina" && !FORA.some((re) => re.test(r.url)));
const EXEMPLO = {
  "/colaboradores/[id]": "colaboradores", "/colaboradores/ponto/horarios/[id]": "ponto_horarios", "/conferencia/[id]": "pedidos",
  "/contagens/[id]": "contagens", "/contagens/[id]/atribuir": "contagens", "/cotacoes/[id]": "cotacoes", "/cotacoes/[id]/comparar": "cotacoes",
  "/cotacoes/[id]/pedidos": "cotacoes", "/delivery/[id]": "delivery_pedidos", "/pedir/acompanhar/[id]": "delivery_pedidos",
  "/delivery/campanhas/[id]": "wpp_campanhas", "/etiquetas/[id]": "etiquetas", "/e/[id]": "etiquetas", "/financeiro/caixa/[id]": "fechamentos_caixa",
  "/salao/caixa/movimentos/[id]": "select id::text from public.pdv_caixa_mov where tipo = 'venda' order by criado_em desc limit 1", "/notas/[id]": "notas_fiscais", "/salao/comandas/[id]": "pdv_comandas",
  "/garcom/comanda/[id]": "pdv_comandas", "/salao/cardapio/adicionais/[itemId]": "cardapio_itens",
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
  if (url.includes("[")) continue;
  telas.push({ rota: r.url, url });
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

async function rodarAxe(page) {
  await page.evaluate(axeFonte);
  return page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    const r = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] }, resultTypes: ["violations"] });
    return {
      violacoes: r.violations.map((v) => ({ id: v.id, impacto: v.impact, ajuda: v.help, nos: v.nodes.length, alvos: v.nodes.slice(0, 3).map((n) => String(n.target).slice(0, 120)) })),
      h1: document.querySelectorAll("h1").length,
      lang: document.documentElement.lang,
      titulo: document.title,
    };
  });
}

async function teclado(page) {
  await page.evaluate(() => { document.activeElement?.blur?.(); window.scrollTo(0, 0); });
  const vistos = [];
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press("Tab");
    const f = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      const visivel = r.width > 1 && r.height > 1 && s.visibility !== "hidden" && Number(s.opacity) > 0.05;
      const indicador = (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) || (s.boxShadow && s.boxShadow !== "none");
      const noMenu = !!el.closest("nav, aside, header");
      const nome = (el.getAttribute("aria-label") || el.innerText || el.getAttribute("placeholder") || el.tagName).trim().replace(/\s+/g, " ").slice(0, 30);
      return { visivel, indicador, noMenu, nome: `${el.tagName.toLowerCase()} "${nome}"` };
    }).catch(() => null);
    if (f) vistos.push(f);
  }
  const semInd = vistos.filter((v) => v.visivel && !v.indicador), invis = vistos.filter((v) => !v.visivel);
  return {
    focados: vistos.length,
    semIndicador: semInd.length, exSemIndicador: [...new Set(semInd.map((v) => v.nome))].slice(0, 3),
    invisiveis: invis.length, exInvisiveis: [...new Set(invis.map((v) => v.nome))].slice(0, 3),
    soMenu: vistos.length >= 30 && vistos.every((v) => v.noMenu),
  };
}

const base = await chromium.launchPersistentContext(perfil, { channel: "chrome", headless: true, viewport: { width: 1440, height: 900 } });
const cookies = await base.cookies();
await base.close();
if (!cookies.some((c) => /sb-.*-auth-token/.test(c.name))) throw new Error("Não está logado: rode o varrer-telas.mjs com --login antes.");
const navegador = await chromium.launch({ channel: "chrome", headless: true });

const COMBOS = [
  { nome: "computador-claro", tema: "claro", viewport: { width: 1440, height: 900 } },
  { nome: "celular-escuro", tema: "escuro", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
];
for (const c of COMBOS) {
  const ctx = await navegador.newContext({ viewport: c.viewport, isMobile: !!c.isMobile, hasTouch: !!c.hasTouch, deviceScaleFactor: c.deviceScaleFactor ?? 1, colorScheme: c.tema === "escuro" ? "dark" : "light", locale: "pt-BR", timezoneId: "America/Sao_Paulo", bypassCSP: true });
  await ctx.addCookies(cookies.concat([{ name: "tema", value: c.tema, domain: HOST, path: "/" }]));
  await travar(ctx);
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.dismiss().catch(() => {}));
  for (const t of alvo) {
    try {
      await page.goto(BASE + t.url, { waitUntil: "load", timeout: 60_000 });
      await page.waitForLoadState("networkidle", { timeout: 12_000 }).catch(() => {});
      await page.waitForTimeout(300);
      const final = new URL(page.url()).pathname;
      const r = await rodarAxe(page);
      gravar({ fase: "axe", combo: c.nome, rota: t.rota, final, ...r });
      let tec = null;
      if (c.nome === "computador-claro") { tec = await teclado(page); gravar({ fase: "teclado", rota: t.rota, ...tec }); }
      console.log(`[${c.nome}] ${t.rota}: ${r.violacoes.length} regras (${r.violacoes.map((v) => v.id).join(", ").slice(0, 140)})${tec ? ` · teclado sem indicador ${tec.semIndicador}, invisível ${tec.invisiveis}` : ""}`);
    } catch (e) {
      gravar({ fase: "erro", combo: c.nome, rota: t.rota, erro: String(e.message).split("\n")[0].slice(0, 200) });
      console.log(`[${c.nome}] ${t.rota}: ERRO ${String(e.message).split("\n")[0].slice(0, 120)}`);
    }
  }
  await ctx.close();
}
await navegador.close();
console.log(`\nCortadas pelo bloqueio (não saíram): ${[...cortadas].slice(0, 40).join(", ") || "nenhuma"}`);
