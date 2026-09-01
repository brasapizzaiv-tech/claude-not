// Agente da BALANÇA da Brasa — roda no PC da balança (quiosque).
// O que ele faz:
//  1. Fala direto com a balança Urano POP-31 na porta serial (manda ENQ, lê o
//     "PESO L") — sem depender do Chrome/Web Serial.
//  2. Serve o peso em http://localhost:8543/peso para a tela do quiosque.
//  3. Recebe as pesagens do quiosque (POST /pesagem) e cria a comanda no
//     sistema. SEM internet? Guarda na fila local e sincroniza depois com
//     RETRY INFINITO — e avisa o sistema quantas estão pendentes (heartbeat).
import { SerialPort } from "serialport";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { readFileSync, appendFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const VERSAO = "1.0.0";
const dir = path.dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(readFileSync(path.join(dir, "config.json"), "utf8").replace(/^﻿/, ""));
const baseUrl = String(cfg.baseUrl || "").replace(/\/$/, "");
const token = cfg.token || "";
const portaHttp = Number(cfg.portaHttp) || 8543;
const portaSerial = cfg.portaSerial || "auto"; // "COM5" ou "auto" (procura Prolific/USB-Serial)
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
const logFile = path.join(dir, "agente.log");
const filaFile = path.join(dir, "fila.json");

function log(m) {
  const linha = `[${new Date().toLocaleString("pt-BR")}] ${m}`;
  console.log(linha);
  try { appendFileSync(logFile, linha + "\n"); } catch { /* sem log */ }
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
