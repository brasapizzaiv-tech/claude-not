// Agente de impressão da Brasa — roda no PC central (um só: as impressoras
// são de rede e ficam todas instaladas no Windows desse PC).
// Fica de olho na fila do sistema (etiquetas, comandas de cozinha, cupom da
// NFC-e, marmitas) e manda cada job para a impressora certa, pelo nome.
import ptp from "pdf-to-printer";
import { writeFile, mkdir } from "node:fs/promises";
import { readFileSync, appendFileSync, writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { iniciarPonto } from "./ponto.mjs";

const { print } = ptp;
const VERSAO = "1.3.1"; // 1.3.1: senha do relógio de ponto cifrada pelo Windows (DPAPI) no relogio.json — a antiga em texto é cifrada sozinha ao ligar; // 1.3.0: avisa o sistema quando um item falha (o sistema desiste depois de 5 e mostra na Saúde do sistema), tempo limite de 45 s na impressão pelo PDF (mata o SumatraPDF pendurado) e o sinal de vida manda a hora da última rodada completa da fila; // 1.2.1: impresso e não confirmado NÃO reimprime (só tenta a baixa de novo) e toda chamada à rede tem tempo limite; // 1.2.0: lê o relógio de ponto Control iD (ponto.mjs, menu do ícone "Relógio de ponto...") e manda as batidas pro sistema; // 1.1.6: consulta a fila a cada 3 s só enquanto há impressão (2 min depois da última), senão a cada 10 s; sinal de vida a cada 60 s — corta 70% das chamadas na Vercel; // 1.1.5: etiqueta deitada (100×70) — repassa a orientação que o servidor manda pro SumatraPDF, que gira toda página mais larga que alta se não for avisado; // 1.1.3: a escala vem do servidor; 1.1.4: cupom em ESC/POS (bytes crus pro spooler) quando o servidor manda formato=escpos
const dir = path.dirname(fileURLToPath(import.meta.url));
// Onde o agente pode ESCREVER (Program Files é só leitura pro usuário comum).
const dataDir = process.env.ProgramData ? path.join(process.env.ProgramData, "AgenteImpressao") : dir;
try { mkdirSync(dataDir, { recursive: true }); } catch { /* já existe */ }
const cfg = JSON.parse(readFileSync(path.join(dir, "config.json"), "utf8").replace(/^﻿/, ""));
const baseUrl = String(cfg.baseUrl || "").replace(/\/$/, "");
const token = cfg.token || "";
const intervalo = Number(cfg.intervaloMs) || 3000;
// Sem nada pra imprimir há 2 min, a consulta espaça (a Vercel cobra por chamada).
const intervaloOcioso = Number(cfg.intervaloOciosoMs) || 10000;
let ultimoJob = 0;
let rodadaEm = null; // última rodada COMPLETA da fila (Date.now() deste PC)
const headers = { Authorization: `Bearer ${token}` };
const tmp = path.join(os.tmpdir(), "brasa-etiquetas");
const logFile = path.join(dataDir, "agente.log");

function log(m) {
  const t = new Date().toLocaleString("pt-BR");
  const linha = `[${t}] ${m}`;
  console.log(linha);
  try { appendFileSync(logFile, linha + "\n"); } catch { /* sem log em arquivo */ }
}

// Orientação da etiqueta lida do próprio PDF (/MediaBox do pdfkit, que vem
// sem compressão): mais larga que alta = landscape. Serve quando o servidor
// ainda não manda "orientacao" — assim o agente novo já acerta sozinho.
function orientacaoDoPdf(buf) {
  const m = buf.toString("latin1").match(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/);
  if (!m) return null;
  const w = Number(m[3]) - Number(m[1]), h = Number(m[4]) - Number(m[2]);
  if (!(w > 0) || !(h > 0)) return null;
  return w > h ? "landscape" : "portrait";
}

// Lista as impressoras do Windows (Get-Printer funciona no Windows novo;
// o getPrinters da lib usa wmic, que foi removido no Win11 recente).
function listarImpressoras() {
  return new Promise((res) => {
    execFile(
      "powershell",
      ["-NoProfile", "-Command", "Get-Printer | Select-Object -ExpandProperty Name"],
      { windowsHide: true, timeout: 10000 },
      (err, stdout) => {
        if (err || !stdout) return res([]);
        res(stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean));
      },
    );
  });
}

// Bytes crus (ESC/POS) pro spooler do Windows, via raw-print.ps1 — a
// impressora térmica desenha com a fonte dela, preta e nítida (o PDF passa
// pelo driver de página e sai cinza/serrilhado).
function imprimirRaw(printer, bytes) {
  return new Promise((resolve, reject) => {
    const file = path.join(tmp, `raw-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.bin`);
    writeFileSync(file, bytes);
    const args = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(dir, "raw-print.ps1"), "-File", file, "-Printer", printer];
    execFile("powershell", args, { windowsHide: true, timeout: 20000 }, (err, out, errOut) => {
      try { unlinkSync(file); } catch { /* fica no tmp */ }
      if (err) return reject(new Error((String(errOut || out || err.message)).split("\n")[0].slice(0, 200)));
      resolve();
    });
  });
}

// Avisa o sistema que está online e manda a lista de impressoras deste PC.
async function heartbeat() {
  try {
    const printers = await listarImpressoras();
    await rede(`${baseUrl}/api/impressao/heartbeat`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      // Vai a IDADE da última rodada (ms), não a hora: o relógio deste PC pode
      // estar adiantado ou atrasado em relação ao servidor.
      body: JSON.stringify({ hostname: os.hostname(), printers, versao: VERSAO, rodada_ha_ms: rodadaEm == null ? null : Date.now() - rodadaEm }),
    });
  } catch { /* silencioso */ }
}

// Tempo limite em toda chamada ao sistema: sem ele, uma conexão pendurada
// prendia o laço (a fila parava e o sinal de vida seguia dizendo "conectado").
const rede = (url, opts = {}) => fetch(url, { ...opts, signal: AbortSignal.timeout(20000) });

// Impressos que ainda não tiveram a baixa confirmada pelo sistema. Se a baixa
// falha (internet, servidor), o item volta na fila em 90 s — e antes era
// impresso DE NOVO (no cupom ESC/POS, até 3 vias). Agora só a baixa é tentada
// de novo. Fica em arquivo pra valer também depois de reiniciar o agente.
const arqSemBaixa = path.join(dataDir, "impressos-sem-baixa.json");
const semBaixa = new Map(); // id -> quando imprimiu (ms)
try {
  for (const [id, t] of Object.entries(JSON.parse(readFileSync(arqSemBaixa, "utf8")))) {
    if (Date.now() - Number(t) < 6 * 3600_000) semBaixa.set(id, Number(t));
  }
} catch { /* primeira vez */ }
function guardarSemBaixa() {
  try { writeFileSync(arqSemBaixa, JSON.stringify(Object.fromEntries(semBaixa))); } catch { /* sem disco */ }
}

// Confirma no sistema que imprimiu. Devolve true só se o servidor aceitou.
async function darBaixa(id) {
  try {
    const r = await rede(`${baseUrl}/api/impressao/baixa`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

// Avisa o sistema que o item falhou (conta as tentativas; depois de 5 a fila
// para de entregar e o painel mostra). Nunca derruba o ciclo.
async function informarFalha(id, erro) {
  try {
    await rede(`${baseUrl}/api/impressao/falha`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ id, erro: String(erro || "falhou").slice(0, 300) }),
    });
  } catch { /* fica no log */ }
}

// O pdf-to-printer chama o SumatraPDF sem tempo limite: se ele pendurar (driver
// travado, impressora sumida), o laço parava de vez. Com 45 s sem resposta,
// mata o SumatraPDF e conta como falha.
function imprimirComTempo(file, opcoes, ms = 45000) {
  return new Promise((resolve, reject) => {
    let acabou = false;
    const t = setTimeout(() => {
      if (acabou) return;
      acabou = true;
      execFile("taskkill", ["/IM", "SumatraPDF.exe", "/F"], { windowsHide: true }, () => {});
      reject(new Error(`a impressão não respondeu em ${Math.round(ms / 1000)} s`));
    }, ms);
    print(file, opcoes).then(
      () => { if (!acabou) { acabou = true; clearTimeout(t); resolve(); } },
      (e) => { if (!acabou) { acabou = true; clearTimeout(t); reject(e); } },
    );
  });
}

// Imprimiu: tenta a baixa; se não der, anota pra não reimprimir.
async function imprimiu(id) {
  if (await darBaixa(id)) { if (semBaixa.delete(id)) guardarSemBaixa(); return; }
  semBaixa.set(id, Date.now());
  guardarSemBaixa();
  log(`Impresso, mas o sistema não confirmou a baixa (${id.slice(0, 8)}). Não vou imprimir de novo: só tento a baixa.`);
}

let rodando = false;
async function ciclo() {
  if (rodando) return;
  rodando = true;
  try {
    const r = await rede(`${baseUrl}/api/impressao/fila`, { headers });
    if (r.status === 401) { log("Token inválido — confira o config.json (copie de Etiquetas → Estações)."); return; }
    if (!r.ok) { log(`Erro ao buscar a fila (${r.status}).`); return; }
    const { jobs } = await r.json();
    if (jobs.length > 0) ultimoJob = Date.now();
    for (const job of jobs) {
      // Já impresso, só faltava a baixa: não imprime de novo (AGT-04).
      if (semBaixa.has(job.id)) {
        if (await darBaixa(job.id)) { semBaixa.delete(job.id); guardarSemBaixa(); log(`Baixa confirmada (${String(job.id).slice(0, 8)}), sem reimprimir.`); }
        continue;
      }
      if (!job.printer) {
        log(`Impressora "${job.impressora || "?"}" sem "Nome no Windows" — pulei. Configure em Etiquetas → Estações.`);
        await informarFalha(job.id, `impressora "${job.impressora || "?"}" sem "Nome no Windows" na Central`);
        continue;
      }
      // ESC/POS: quem decide é o servidor (campo "formato" da fila). Se a
      // impressora recusar os bytes crus (não é térmica ESC/POS), cai pro PDF.
      if (job.formato === "escpos") {
        // Só a IMPRESSÃO fica no try: antes a baixa estava junto, e uma baixa que
        // falhava era lida como "ESC/POS falhou" e o cupom saía de novo pelo PDF.
        let impressoRaw = false;
        try {
          const pr = await rede(`${baseUrl}${job.url}?formato=escpos`, { headers });
          if (!pr.ok) throw new Error(`servidor respondeu ${pr.status}`);
          const bytes = Buffer.from(await pr.arrayBuffer());
          if (bytes.length < 8) throw new Error("cupom vazio");
          await imprimirRaw(job.printer, bytes);
          impressoRaw = true;
        } catch (e) {
          log(`ESC/POS falhou (${e.message}) — tentando pelo PDF.`);
        }
        if (impressoRaw) {
          await imprimiu(job.id);
          log(`Impresso (ESC/POS) em "${job.printer}".`);
          continue;
        }
      }
      try {
        const pr = await rede(`${baseUrl}${job.url}`, { headers });
        if (!pr.ok) { log(`Erro ao gerar o PDF (${pr.status}).`); await informarFalha(job.id, `o sistema não gerou o PDF (${pr.status})`); continue; }
        const buf = Buffer.from(await pr.arrayBuffer());
        const file = path.join(tmp, `${job.id}.pdf`);
        await writeFile(file, buf);
        // Como imprimir: quem manda é o servidor (campo "escala" da fila).
        // Assim dá pra ajustar sem trocar o agente. Sem esse campo (servidor
        // antigo), vale a regra de antes: etiqueta 1:1, o resto ajustado.
        const etiqueta = ["etiqueta", "marmita", "teste_etiqueta"].includes(String(job.tipo || ""));
        const escala = job.escala === "noscale" || job.escala === "fit"
          ? job.escala
          : (etiqueta ? "noscale" : "fit");
        const opcoes = { printer: job.printer, scale: escala };
        // Orientação: o SumatraPDF gira sozinho qualquer página mais larga que
        // alta e só desgira quando recebe "landscape" (sem mexer no driver, que
        // fica em Retrato). O servidor sabe o formato da etiqueta e manda a
        // orientação certa; sem ela (servidor antigo), etiqueta vai sem
        // orientação como antes e o resto vai em retrato.
        if (job.orientacao === "landscape" || job.orientacao === "portrait") opcoes.orientation = job.orientacao;
        else if (etiqueta) { const o = orientacaoDoPdf(buf); if (o) opcoes.orientation = o; }
        else opcoes.orientation = "portrait";
        await imprimirComTempo(file, opcoes);
        await imprimiu(job.id);
        log(`Impresso em "${job.printer}".`);
      } catch (e) {
        log(`Falha ao imprimir: ${e.message}`);
        await informarFalha(job.id, `${job.printer}: ${e.message}`);
      }
    }
    rodadaEm = Date.now();
  } catch (e) {
    log(`Sem conexão com o servidor: ${e.message}`);
  } finally {
    rodando = false;
  }
}

try { writeFileSync(path.join(dataDir, "agente.pid"), String(process.pid)); } catch { /* ok */ }
log(`Agente de impressão v${VERSAO} no ar.`);
log(`Servidor: ${baseUrl || "(vazio!)"}`);
if (!token) log("ATENÇÃO: token vazio no config.json.");
await mkdir(tmp, { recursive: true });
// Um ciclo agenda o próximo: 3 s enquanto está imprimindo, 10 s quando ocioso.
async function laco() {
  await ciclo();
  const ativo = Date.now() - ultimoJob < 120000;
  setTimeout(laco, ativo ? intervalo : intervaloOcioso);
}
laco();
heartbeat();
setInterval(heartbeat, 60000);
iniciarPonto({ dataDir, baseUrl, headers, log });
