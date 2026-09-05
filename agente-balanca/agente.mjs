// Agente da BALANÇA da Brasa — roda no PC da balança (quiosque).
// O que ele faz:
//  1. Fala direto com a balança Urano POP-31 na porta serial (manda ENQ, lê o
//     "PESO L") — sem depender do Chrome/Web Serial.
//  2. Serve o peso em http://localhost:8543/peso para a tela do quiosque.
//  3. Recebe as pesagens do quiosque (POST /pesagem) e cria a comanda no
//     sistema. SEM internet? Guarda na fila local e sincroniza depois com
//     RETRY INFINITO — e avisa o sistema quantas estão pendentes (heartbeat).
//  4. Imprime o CUPOM na térmica ligada neste PC (POST /imprimir) — sem a
//     janela de impressão do navegador. Impressora escolhida na tela do quiosque.
import { SerialPort } from "serialport";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { readFileSync, appendFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const VERSAO = "1.1.0";
const dir = path.dirname(fileURLToPath(import.meta.url));
const cfgFile = path.join(dir, "config.json");
const cfg = JSON.parse(readFileSync(cfgFile, "utf8").replace(/^﻿/, ""));
const baseUrl = String(cfg.baseUrl || "").replace(/\/$/, "");
const token = cfg.token || "";
const portaHttp = Number(cfg.portaHttp) || 8543;
const portaSerial = cfg.portaSerial || "auto"; // "COM5" ou "auto" (procura Prolific/USB-Serial)
let impressoraCupom = String(cfg.impressoraCupom || ""); // nome no Windows; "" = impressora padrão
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
const logFile = path.join(dir, "agente.log");
const filaFile = path.join(dir, "fila.json");
const logoFile = path.join(dir, "logo.png");
const tmpDir = path.join(dir, "tmp");

function log(m) {
  const linha = `[${new Date().toLocaleString("pt-BR")}] ${m}`;
  console.log(linha);
  try { appendFileSync(logFile, linha + "\n"); } catch { /* sem log */ }
}
// Qualquer erro inesperado vai pro log (em vez de matar o agente em silêncio).
process.on("uncaughtException", (e) => log(`ERRO inesperado: ${e?.stack || e}`));
process.on("unhandledRejection", (e) => log(`ERRO (promise): ${e?.stack || e}`));

// Bibliotecas de impressão carregadas só na hora de imprimir: se faltar algo
// neste PC, o agente continua lendo a balança e o erro aparece no log.
let libsImpressao = null;
async function carregarImpressao() {
  if (libsImpressao) return libsImpressao;
  const ptp = await import("pdf-to-printer");
  const { gerarCupomPdf } = await import("./cupom.mjs");
  const imprimirPdf = ptp.print || ptp.default?.print;
  if (typeof imprimirPdf !== "function") throw new Error("pdf-to-printer sem função print");
  libsImpressao = { imprimirPdf, gerarCupomPdf };
  return libsImpressao;
}
function salvarConfig() {
  try { writeFileSync(cfgFile, JSON.stringify({ ...cfg, impressoraCupom }, null, 2)); } catch (e) { log(`Não gravei o config.json: ${e.message}`); }
}

// ---------- impressão do cupom ----------
// Impressoras do Windows (Get-CimInstance; o wmic sumiu no Win11).
function listarImpressoras() {
  return new Promise((res) => {
    execFile("powershell", ["-NoProfile", "-Command", "Get-CimInstance Win32_Printer | Select-Object Name, Default | ConvertTo-Json -Compress"],
      { windowsHide: true, timeout: 15000 }, (err, out) => {
        if (err) return res([]);
        try {
          const j = JSON.parse(String(out || "[]").trim() || "[]");
          const lista = Array.isArray(j) ? j : [j];
          res(lista.filter((p) => p && p.Name).map((p) => ({ nome: String(p.Name), padrao: !!p.Default })));
        } catch { res([]); }
      });
  });
}
// Logo do cupom: baixa do sistema uma vez e guarda (funciona offline depois).
async function atualizarLogo() {
  try {
    const r = await fetch(`${baseUrl}/logo-brasa.png`, { signal: AbortSignal.timeout(8000) });
    if (r.ok) writeFileSync(logoFile, Buffer.from(await r.arrayBuffer()));
  } catch { /* fica com a logo antiga (ou sem) */ }
}
async function imprimirCupom(d) {
  const { imprimirPdf, gerarCupomPdf } = await carregarImpressao();
  const logo = existsSync(logoFile) ? readFileSync(logoFile) : null;
  const urlComanda = d.id ? `${baseUrl}/salao/comandas/${d.id}` : null;
  const pdf = await gerarCupomPdf({ ...d, logo, urlComanda });
  mkdirSync(tmpDir, { recursive: true });
  const file = path.join(tmpDir, `cupom-${Date.now()}.pdf`);
  writeFileSync(file, pdf);
  const opts = { scale: "noscale" };
  if (impressoraCupom) opts.printer = impressoraCupom;
  await imprimirPdf(file, opts);
  log(`Cupom ${d.codigoOffline || "#" + d.numero} impresso em "${impressoraCupom || "impressora padrão"}".`);
}

// ---------- fila offline (persistida em disco, retry infinito) ----------
let fila = [];
try { if (existsSync(filaFile)) fila = JSON.parse(readFileSync(filaFile, "utf8")); } catch { fila = []; }
function salvarFila() {
  try { writeFileSync(filaFile, JSON.stringify(fila)); } catch { /* disco */ }
}

// ---------- leitura da balança ----------
let peso = 0;
let tara = 0;
let ultimaLeitura = 0; // timestamp da última leitura válida
let serial = null;
let buf = "";

async function acharPorta() {
  if (portaSerial !== "auto") return portaSerial;
  const portas = await SerialPort.list();
  const alvo = portas.find((p) =>
    /prolific|usb.*serial|serial.*usb/i.test(`${p.manufacturer ?? ""} ${p.friendlyName ?? ""}`),
  );
  return alvo?.path ?? portas[0]?.path ?? null;
}

async function conectarBalanca() {
  try {
    const caminho = await acharPorta();
    if (!caminho) { log("Nenhuma porta serial encontrada — tento de novo em 10s."); return; }
    serial = new SerialPort({ path: caminho, baudRate: 9600, dataBits: 8, stopBits: 1, parity: "none" });
    serial.on("open", () => log(`Balança conectada em ${caminho} (9600 8-N-1).`));
    serial.on("data", (chunk) => {
      buf += chunk.toString("latin1");
      if (buf.length > 800) buf = buf.slice(-800);
      const t = [...buf.matchAll(/TARA[:\s]*(-?\d+[.,]\d+)/gi)];
      if (t.length) tara = parseFloat(t[t.length - 1][1].replace(",", "."));
      const m = [...buf.matchAll(/PESO\s*L[:\s]*(-?\d+[.,]\d+)/gi)];
      if (m.length) {
        peso = parseFloat(m[m.length - 1][1].replace(",", "."));
        ultimaLeitura = Date.now();
      }
    });
    serial.on("error", (e) => { log(`Erro na serial: ${e.message}`); tentarReconectar(); });
    serial.on("close", () => { log("Porta serial fechou."); tentarReconectar(); });
  } catch (e) {
    log(`Não conectou na balança: ${e.message}`);
    tentarReconectar();
  }
}
let reconectando = false;
function tentarReconectar() {
  if (reconectando) return;
  reconectando = true;
  try { serial?.close(() => {}); } catch { /* já fechada */ }
  serial = null;
  setTimeout(() => { reconectando = false; conectarBalanca(); }, 10000);
}

// A POP-31 é "computadora": só responde quando recebe ENQ (0x05).
setInterval(() => {
  try { if (serial?.isOpen) serial.write(Buffer.from([0x05])); } catch { /* fechada */ }
}, 500);

// ---------- sincronização com o sistema ----------
async function criarComandaNoSistema(p) {
  const r = await fetch(`${baseUrl}/api/balanca/pesagem`, {
    method: "POST",
    headers,
    body: JSON.stringify(p),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  if (!j.ok) throw new Error(j.erro || "falha");
  return j;
}

// Fila: tenta sincronizar TUDO a cada 15s, para sempre (nunca desiste).
let sincronizando = false;
async function sincronizarFila() {
  if (sincronizando || fila.length === 0) return;
  sincronizando = true;
  try {
    while (fila.length > 0) {
      const p = fila[0];
      try {
        const r = await criarComandaNoSistema(p);
        log(`Fila: pesagem de ${p.ts} sincronizada → comanda #${r.numero}.`);
        fila.shift();
        salvarFila();
      } catch (e) {
        log(`Fila: ainda sem conexão (${e.message}) — ${fila.length} pendente(s), tento de novo.`);
        break;
      }
    }
  } finally {
    sincronizando = false;
  }
}
setInterval(sincronizarFila, 15000);

// Heartbeat: status + tamanho da fila (pro painel ALERTAR pendências).
async function heartbeat() {
  try {
    await fetch(`${baseUrl}/api/balanca/status`, {
      method: "POST",
      headers,
      body: JSON.stringify({ hostname: os.hostname(), fila_pendente: fila.length, versao: VERSAO }),
      signal: AbortSignal.timeout(8000),
    });
  } catch { /* offline */ }
}
setInterval(heartbeat, 15000);

// ---------- servidor local pro quiosque ----------
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }

  if (req.method === "GET" && req.url === "/peso") {
    res.writeHead(200, { ...cors, "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      ok: true,
      peso,
      tara,
      lendo: Date.now() - ultimaLeitura < 3000, // balança respondendo?
      fila: fila.length,
      versao: VERSAO,
    }));
  }

  if (req.method === "POST" && req.url === "/pesagem") {
    let corpo = "";
    req.on("data", (c) => { corpo += c; if (corpo.length > 10000) req.destroy(); });
    req.on("end", async () => {
      let p;
      try { p = JSON.parse(corpo); } catch { res.writeHead(400, cors); return res.end(); }
      p.ts = p.ts || new Date().toISOString();
      try {
        // Tenta na hora (online): devolve a comanda de verdade.
        const r = await criarComandaNoSistema(p);
        res.writeHead(200, { ...cors, "Content-Type": "application/json" });
        res.end(JSON.stringify({ ...r, offline: false }));
      } catch {
        // Sem internet: guarda na fila e devolve um código local pro cupom.
        const codigo = `OFF-${String(Date.now()).slice(-6)}`;
        fila.push({ ...p, codigo_local: codigo });
        salvarFila();
        log(`OFFLINE: pesagem guardada na fila (${codigo}) — ${fila.length} pendente(s).`);
        res.writeHead(200, { ...cors, "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, offline: true, codigo }));
      }
    });
    return;
  }

  // Impressoras deste PC + a escolhida pro cupom.
  if (req.method === "GET" && req.url === "/impressoras") {
    const impressoras = await listarImpressoras();
    res.writeHead(200, { ...cors, "Content-Type": "application/json" });
    return res.end(JSON.stringify({ ok: true, impressoras, atual: impressoraCupom }));
  }

  // Escolha da impressora do cupom (gravada no config.json).
  if (req.method === "POST" && req.url === "/config") {
    let corpo = "";
    req.on("data", (c) => { corpo += c; if (corpo.length > 10000) req.destroy(); });
    req.on("end", () => {
      try {
        const p = JSON.parse(corpo);
        if (typeof p.impressoraCupom === "string") { impressoraCupom = p.impressoraCupom.trim(); salvarConfig(); log(`Impressora do cupom: "${impressoraCupom || "padrão"}".`); }
        res.writeHead(200, { ...cors, "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, atual: impressoraCupom }));
      } catch { res.writeHead(400, cors); res.end(); }
    });
    return;
  }

  // Imprime o cupom da pesagem na térmica deste PC.
  if (req.method === "POST" && req.url === "/imprimir") {
    let corpo = "";
    req.on("data", (c) => { corpo += c; if (corpo.length > 20000) req.destroy(); });
    req.on("end", async () => {
      let d;
      try { d = JSON.parse(corpo); } catch { res.writeHead(400, cors); return res.end(); }
      try {
        await imprimirCupom(d);
        res.writeHead(200, { ...cors, "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        log(`Falha ao imprimir o cupom: ${e.message}`);
        res.writeHead(200, { ...cors, "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, erro: e.message }));
      }
    });
    return;
  }

  res.writeHead(404, cors);
  res.end();
});

server.listen(portaHttp, "127.0.0.1", () => {
  log(`Agente da balança v${VERSAO} no ar — http://localhost:${portaHttp} (peso) · fila: ${fila.length} pendente(s).`);
});

// PID pra bandeja/desinstalador
try { writeFileSync(path.join(dir, "agente.pid"), String(process.pid)); } catch { /* sem pid */ }

conectarBalanca();
heartbeat();
sincronizarFila();
atualizarLogo();
setInterval(atualizarLogo, 6 * 3600 * 1000);
log(`Impressora do cupom: "${impressoraCupom || "padrão do Windows"}" (escolha na tela do quiosque, ⚙️).`);
// Confere logo no início se a impressão vai funcionar (só avisa no log).
carregarImpressao().then(() => log("Impressão de cupom pronta.")).catch((e) => log(`Impressão de cupom INDISPONÍVEL: ${e.message}`));
