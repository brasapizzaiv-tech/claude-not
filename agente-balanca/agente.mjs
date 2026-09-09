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
import { readFileSync, appendFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { gerarCupomEscPos, gerarTesteEscPos } from "./escpos.mjs";

const VERSAO = "1.2.1"; // 1.2.0: agente NUMERA e IMPRIME NA HORA, ESC/POS direto na térmica; 1.2.1: logo da Brasa sai no ESC/POS (silhueta, era laranja clara demais e saía em branco)
const dir = path.dirname(fileURLToPath(import.meta.url));
const cfgFile = path.join(dir, "config.json");
const cfg = JSON.parse(readFileSync(cfgFile, "utf8").replace(/^﻿/, ""));
// Onde o agente pode ESCREVER: o instalador põe o programa em Program Files,
// que o Windows não deixa o usuário alterar (por isso a impressora escolhida
// "não gravava"). Log, fila, pid e a escolha da impressora vão pra ProgramData.
const dataDir = process.env.ProgramData ? path.join(process.env.ProgramData, "AgenteBalanca") : dir;
try { mkdirSync(dataDir, { recursive: true }); } catch { /* já existe */ }
const estadoFile = path.join(dataDir, "estado.json");
let estado = {};
try { estado = JSON.parse(readFileSync(estadoFile, "utf8")); } catch { /* primeira vez */ }
const baseUrl = String(cfg.baseUrl || "").replace(/\/$/, "");
const token = cfg.token || "";
const portaHttp = Number(cfg.portaHttp) || 8543;
const portaSerial = cfg.portaSerial || "auto"; // "COM5" ou "auto" (procura Prolific/USB-Serial)
let impressoraCupom = String(estado.impressoraCupom ?? cfg.impressoraCupom ?? ""); // nome no Windows; "" = impressora padrão
let impressaoModo = estado.impressaoModo === "pdf" ? "pdf" : "escpos"; // escpos = direto na térmica (rápido); pdf = caminho antigo
// Numeração da balança (o agente numera e imprime na hora; o sistema recebe o
// número junto com a pesagem). Reinicia a cada abertura de caixa.
let numeroInicial = Number(estado.numeroInicial) || 200;
const hojeSP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
function salvarEstado() {
  try { writeFileSync(estadoFile, JSON.stringify(estado, null, 2)); } catch (e) { log(`Não gravei o estado (${estadoFile}): ${e.message}`); }
}
function proximoNumeroBalanca() {
  const hoje = hojeSP();
  // Sem contato com o sistema (offline) o reinício é diário.
  if (estado.resetDia !== hoje || !(Number(estado.proximoNumero) > 0)) {
    estado.proximoNumero = numeroInicial;
    estado.resetDia = hoje;
  }
  const n = Number(estado.proximoNumero);
  estado.proximoNumero = n + 1;
  salvarEstado();
  return n;
}
// Chamado pelo heartbeat com o que o sistema respondeu: caixa aberto agora?
function aplicarNumeracao(j) {
  if (!j) return;
  if (Number(j.numero_inicial_balanca) > 0 && Number(j.numero_inicial_balanca) !== numeroInicial) {
    numeroInicial = Number(j.numero_inicial_balanca);
    estado.numeroInicial = numeroInicial;
  }
  const ref = j.caixa_aberto_em || null;
  if (ref && ref !== estado.caixaRef) {
    // Caixa novo: reinicia — a não ser que já tenha reiniciado hoje (evita
    // repetir número se a balança já rodou antes do caixa abrir).
    estado.caixaRef = ref;
    if (estado.resetDia !== hojeSP()) {
      estado.proximoNumero = numeroInicial;
      estado.resetDia = hojeSP();
      log(`Caixa aberto no sistema: numeração da balança reiniciada em ${numeroInicial}.`);
    }
  }
  salvarEstado();
}
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
const logFile = path.join(dataDir, "agente.log");
const filaFile = path.join(dataDir, "fila.json");
const logoFile = path.join(dataDir, "logo.png");
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
  estado = { ...estado, impressoraCupom, impressaoModo };
  salvarEstado();
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
// Bytes crus (ESC/POS) pro spooler do Windows, via raw-print.ps1.
function imprimirRaw(bytes) {
  return new Promise((resolve, reject) => {
    const tdir = path.join(dataDir, "tmp");
    mkdirSync(tdir, { recursive: true });
    const file = path.join(tdir, `raw-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.bin`);
    writeFileSync(file, bytes);
    const args = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(dir, "raw-print.ps1"), "-File", file];
    if (impressoraCupom) args.push("-Printer", impressoraCupom);
    execFile("powershell", args, { windowsHide: true, timeout: 20000 }, (err, out, errOut) => {
      try { unlinkSync(file); } catch { /* fica no tmp */ }
      if (err) return reject(new Error((String(errOut || out || err.message)).split("\n")[0].slice(0, 200)));
      resolve();
    });
  });
}
async function imprimirCupomPdf(d) {
  const { imprimirPdf, gerarCupomPdf } = await carregarImpressao();
  const logo = existsSync(logoFile) ? readFileSync(logoFile) : null;
  const urlComanda = d.urlComanda || (d.id ? `${baseUrl}/salao/comandas/${d.id}` : null);
  const pdf = await gerarCupomPdf({ ...d, logo, urlComanda });
  mkdirSync(tmpDir, { recursive: true });
  const file = path.join(tmpDir, `cupom-${Date.now()}.pdf`);
  writeFileSync(file, pdf);
  const opts = { scale: "noscale" };
  if (impressoraCupom) opts.printer = impressoraCupom;
  await imprimirPdf(file, opts);
}
async function imprimirCupom(d) {
  const t0 = Date.now();
  if (impressaoModo === "escpos") {
    try {
      const logo = existsSync(logoFile) ? readFileSync(logoFile) : null;
      const urlComanda = d.urlComanda || (d.id ? `${baseUrl}/salao/comandas/${d.id}` : null);
      await imprimirRaw(gerarCupomEscPos({ ...d, logo, urlComanda }));
      log(`Cupom ${d.codigoOffline || "#" + d.numero} impresso (ESC/POS, ${Date.now() - t0} ms) em "${impressoraCupom || "impressora padrão"}".`);
      return;
    } catch (e) {
      log(`ESC/POS falhou (${e.message}) — tentando pelo PDF.`);
    }
  }
  await imprimirCupomPdf(d);
  log(`Cupom ${d.codigoOffline || "#" + d.numero} impresso (PDF, ${Date.now() - t0} ms) em "${impressoraCupom || "impressora padrão"}".`);
}

// Fila de impressão com retentativa: se a impressora estiver ocupada/desligada,
// o cupom NÃO se perde — tenta de novo a cada 10 s por até 15 min.
const filaImpFile = path.join(dataDir, "fila-impressao.json");
let filaImp = [];
try { if (existsSync(filaImpFile)) filaImp = JSON.parse(readFileSync(filaImpFile, "utf8")); } catch { filaImp = []; }
const salvarFilaImp = () => { try { writeFileSync(filaImpFile, JSON.stringify(filaImp)); } catch { /* disco */ } };
let imprimindo = false;
async function processarImpressoes() {
  if (imprimindo || filaImp.length === 0) return;
  imprimindo = true;
  try {
    while (filaImp.length > 0) {
      const job = filaImp[0];
      try {
        await imprimirCupom(job.d);
        filaImp.shift(); salvarFilaImp();
      } catch (e) {
        job.tentativas = (job.tentativas || 0) + 1;
        salvarFilaImp();
        if (job.tentativas >= 90) {
          log(`Cupom ${job.d.codigoOffline || "#" + job.d.numero} DESISTIDO após ${job.tentativas} tentativas (${e.message}). Reimprima pelo sistema.`);
          filaImp.shift(); salvarFilaImp();
          continue;
        }
        log(`Cupom ${job.d.codigoOffline || "#" + job.d.numero} não imprimiu (${e.message}) — tentativa ${job.tentativas}, tento de novo em 10 s.`);
        break;
      }
    }
  } finally { imprimindo = false; }
}
function enfileirarImpressao(d) {
  filaImp.push({ d, tentativas: 0, ts: new Date().toISOString() });
  salvarFilaImp();
  processarImpressoes();
}
setInterval(processarImpressoes, 10000);

// ---------- fila offline (persistida em disco, retry infinito) ----------
let fila = [];
try { if (existsSync(filaFile)) fila = JSON.parse(readFileSync(filaFile, "utf8")); } catch { fila = []; }
function salvarFila() {
  try { writeFileSync(filaFile, JSON.stringify(fila)); } catch { /* disco */ }
}

// ---------- leitura da balança ----------
// Número do rótulo: grupo 1 = sinal antes, grupo 2 = dígitos, grupo 3 = sinal depois.
function numDe(m) {
  const v = parseFloat(String(m[2]).replace(",", "."));
  const neg = (m[1] && m[1] !== "") || (m[3] && m[3] !== "");
  return neg ? -v : v;
}
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
      // Peso NEGATIVO (marmita sem o prato, com tara na balança): o sinal pode vir
      // antes ("-0.180", "- 0.180", "−0,180") ou depois ("0.180-"). Tudo aceito.
      const t = [...buf.matchAll(/TARA\s*[:=]?\s*([-−]?)\s*(\d+[.,]\d+)/gi)];
      if (t.length) tara = numDe(t[t.length - 1]);
      const m = [...buf.matchAll(/PESO\s*L\s*[:=]?\s*([-−]?)\s*(\d+[.,]\d+)\s*(?:kg)?\s*([-−]?)/gi)];
      if (m.length) {
        peso = numDe(m[m.length - 1]);
        ultimaLeitura = Date.now();
      } else {
        // Protocolos curtos da POP-S (F3 na balança):
        //  "Prot F": STX + peso COM ponto e SINAL (ex.: "-0.180") — transmite negativo.
        //  "Prot 3" (Toledo): STX + 5 dígitos sem ponto (gramas) + CR; "IIIII" instável,
        //  "SSSSS" sobrecarga, "NNNNN" negativo (sem o valor).
        const f = [...buf.matchAll(/\x02\s*([-+−]?)\s*(\d+[.,]\d+)/g)];
        if (f.length) {
          peso = numDe([f[f.length - 1][0], f[f.length - 1][1], f[f.length - 1][2], ""]);
          ultimaLeitura = Date.now();
        } else {
          const t3 = [...buf.matchAll(/\x02(\d{5})\r/g)];
          if (t3.length) {
            peso = parseInt(t3[t3.length - 1][1], 10) / 1000;
            ultimaLeitura = Date.now();
          } else if (/\x02NNNNN/.test(buf.slice(-40))) {
            peso = -0.001; // negativo sem valor (Prot 3): troque a balança para "Prot F" pra ter o número
            ultimaLeitura = Date.now();
          }
        }
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
function tentarReconectar(espera = 10000) {
  if (reconectando) return;
  reconectando = true;
  try { serial?.removeAllListeners("close"); serial?.close(() => {}); } catch { /* já fechada */ }
  serial = null;
  buf = "";
  setTimeout(() => { reconectando = false; conectarBalanca(); }, espera);
}

// A POP-31 é "computadora": só responde quando recebe ENQ (0x05).
setInterval(() => {
  try { if (serial?.isOpen) serial.write(Buffer.from([0x05])); } catch { /* fechada */ }
}, 500);

// WATCHDOG da serial: o driver USB-Serial (Prolific) às vezes "congela" sem
// avisar — a porta continua aberta mas não chega mais nada. Antes só um
// reinício do agente resolvia. Agora: 15 s sem leitura (já tendo lido antes)
// → fecha e reabre a porta sozinho. Balança desligada? Fica tentando a cada 15 s.
setInterval(() => {
  if (!serial?.isOpen || reconectando) return;
  const semLeitura = Date.now() - ultimaLeitura;
  if (ultimaLeitura > 0 && semLeitura > 15000) {
    log(`Sem leitura da balança há ${Math.round(semLeitura / 1000)}s com a porta aberta — reabrindo a serial (watchdog).`);
    ultimaLeitura = 0;
    tentarReconectar(2000);
  }
}, 5000);

// ---------- sincronização com o sistema ----------
async function criarComandaNoSistema(p) {
  const r = await fetch(`${baseUrl}/api/balanca/pesagem`, {
    method: "POST",
    headers,
    body: JSON.stringify(p),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) {
    let detalhe = "";
    try { detalhe = (await r.json()).erro || ""; } catch { /* sem corpo */ }
    // status 4xx = o sistema RECUSOU a pesagem (não é falta de internet)
    throw Object.assign(new Error(`HTTP ${r.status}${detalhe ? ` — ${detalhe}` : ""}`), { status: r.status });
  }
  const j = await r.json();
  if (!j.ok) throw Object.assign(new Error(j.erro || "falha"), { status: 400 });
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
        log(`Fila: pesagem de ${p.ts} sincronizada → comanda #${r.numero}${r.jaExistia ? " (já estava no sistema)" : ""}.`);
        fila.shift();
        salvarFila();
      } catch (e) {
        if (e.status >= 400 && e.status < 500) {
          // Recusada de vez (peso inválido, token errado, preço não configurado…):
          // tira da fila e guarda em fila-erros.json — senão ela trava as de trás pra sempre.
          log(`Fila: pesagem de ${p.ts} RECUSADA pelo sistema (${e.message}) — movida para fila-erros.json.`);
          try {
            const errosFile = path.join(dataDir, "fila-erros.json");
            const erros = existsSync(errosFile) ? JSON.parse(readFileSync(errosFile, "utf8")) : [];
            erros.push({ ...p, erro: e.message, em: new Date().toISOString() });
            writeFileSync(errosFile, JSON.stringify(erros, null, 2));
          } catch (e2) { log(`Não gravei fila-erros.json: ${e2.message}`); }
          fila.shift();
          salvarFila();
          continue;
        }
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
    const r = await fetch(`${baseUrl}/api/balanca/status`, {
      method: "POST",
      headers,
      body: JSON.stringify({ hostname: os.hostname(), fila_pendente: fila.length, versao: VERSAO, proximo_numero: estado.proximoNumero ?? null }),
      signal: AbortSignal.timeout(8000),
    });
    if (r.ok) aplicarNumeracao(await r.json().catch(() => null));
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
      proximoNumero: estado.proximoNumero ?? null,
      impressaoModo,
    }));
  }

  // Diagnóstico: o que a balança mandou por último, cru (pra ver o formato do negativo etc.).
  if (req.method === "GET" && req.url === "/raw") {
    res.writeHead(200, { ...cors, "Content-Type": "application/json" });
    return res.end(JSON.stringify({ ok: true, raw: buf.slice(-400), peso, tara, lendo: Date.now() - ultimaLeitura < 3000, versao: VERSAO }));
  }

  if (req.method === "POST" && req.url === "/pesagem") {
    let corpo = "";
    req.on("data", (c) => { corpo += c; if (corpo.length > 10000) req.destroy(); });
    req.on("end", async () => {
      let p;
      try { p = JSON.parse(corpo); } catch { res.writeHead(400, cors); return res.end(); }
      p.ts = p.ts || new Date().toISOString();

      // NOVO fluxo (quiosque manda valor/líquido/livre já calculados): o agente
      // numera, IMPRIME NA HORA e manda pro sistema em seguida (fila com retry).
      if (p.valor != null) {
        const id = randomUUID();
        const numero = proximoNumeroBalanca();
        const registro = { peso: p.peso, tara_balanca: p.tara_balanca, so_kg: p.so_kg, livre_direto: p.livre_direto, ts: p.ts, id, numero };
        fila.push(registro); salvarFila();
        const cupomDados = {
          ...(p.cupom || {}),
          id, numero,
          peso: Number(p.peso) || 0, tara: Number(p.tara_balanca) || 0,
          valor: Number(p.valor) || 0, liquido: Number(p.liquido) || 0,
          livre: !!p.livre, viradaLivre: !!p.viradaLivre, antes: p.antes ?? null,
          urlComanda: `${baseUrl}/salao/comandas/${id}`,
        };
        enfileirarImpressao(cupomDados);
        res.writeHead(200, { ...cors, "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, id, numero, valor: cupomDados.valor, liquido: cupomDados.liquido, peso: cupomDados.peso, tara: cupomDados.tara, livre: cupomDados.livre, offline: false, impresso: "agente" }));
        sincronizarFila();
        return;
      }

      try {
        // Fluxo antigo (quiosque sem o valor): tenta na hora (online).
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
    return res.end(JSON.stringify({ ok: true, impressoras, atual: impressoraCupom, modo: impressaoModo }));
  }

  // Escolha da impressora do cupom (gravada no config.json).
  if (req.method === "POST" && req.url === "/config") {
    let corpo = "";
    req.on("data", (c) => { corpo += c; if (corpo.length > 10000) req.destroy(); });
    req.on("end", () => {
      try {
        const p = JSON.parse(corpo);
        if (typeof p.impressoraCupom === "string") { impressoraCupom = p.impressoraCupom.trim(); salvarConfig(); log(`Impressora do cupom: "${impressoraCupom || "padrão"}".`); }
        if (p.impressaoModo === "escpos" || p.impressaoModo === "pdf") { impressaoModo = p.impressaoModo; salvarConfig(); log(`Modo de impressão: ${impressaoModo}.`); }
        res.writeHead(200, { ...cors, "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, atual: impressoraCupom, modo: impressaoModo }));
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
      // Vai pela fila: se a impressora falhar agora, tenta de novo sozinho.
      enfileirarImpressao(d);
      res.writeHead(200, { ...cors, "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, fila: filaImp.length }));
    });
    return;
  }

  // Teste da impressão rápida (ESC/POS) direto na impressora escolhida.
  if (req.method === "POST" && req.url === "/imprimir-teste") {
    try {
      await imprimirRaw(gerarTesteEscPos(impressoraCupom || "impressora padrão"));
      res.writeHead(200, { ...cors, "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      log(`Teste ESC/POS falhou: ${e.message}`);
      res.writeHead(200, { ...cors, "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, erro: e.message }));
    }
    return;
  }

  res.writeHead(404, cors);
  res.end();
});

server.listen(portaHttp, "127.0.0.1", () => {
  log(`Agente da balança v${VERSAO} no ar — http://localhost:${portaHttp} (peso) · fila: ${fila.length} pendente(s).`);
});

// PID pra bandeja/desinstalador
try { writeFileSync(path.join(dataDir, "agente.pid"), String(process.pid)); } catch { /* sem pid */ }

conectarBalanca();
heartbeat();
sincronizarFila();
atualizarLogo();
setInterval(atualizarLogo, 6 * 3600 * 1000);
log(`Impressora do cupom: "${impressoraCupom || "padrão do Windows"}" · modo ${impressaoModo} · próximo nº da balança: ${estado.proximoNumero ?? numeroInicial} (escolha na tela do quiosque, ⚙️).`);
processarImpressoes();
// Confere logo no início se a impressão vai funcionar (só avisa no log).
carregarImpressao().then(() => log("Impressão de cupom pronta.")).catch((e) => log(`Impressão de cupom INDISPONÍVEL: ${e.message}`));
