// Agente TEF da Brasa — roda em CADA PC de caixa que tem pinpad.
//
// O caixa (no navegador) chama http://localhost:8544; este agente fala com o
// gerenciador de TEF instalado no Windows (Elgin TEF Hub / PayGo / SiTef)
// pelo protocolo de troca de arquivos: grava IntPos.001 na pasta Req, espera a
// resposta na pasta Resp, e só CONFIRMA (CNF) depois que o sistema gravou a
// venda — se a venda não gravar, DESFAZ (NCN). Assim nunca fica cartão cobrado
// sem venda registrada, nem venda registrada sem cartão cobrado.
//
// Sem gerenciador instalado (antes da Elgin liberar), o simulador-gp.mjs
// responde como se fosse ele — dá pra testar o caixa inteiro.
import http from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, renameSync, appendFileSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requisicaoVenda, requisicaoConfirmar, requisicaoDesfazer, requisicaoCancelar, requisicaoAdm, interpretar } from "./intpos.mjs";

const VERSAO = "0.9.0"; // 0.9: primeira versão, testada contra o simulador (aguardando homologação Elgin)
const dir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.ProgramData ? path.join(process.env.ProgramData, "AgenteTEF") : dir;
try { mkdirSync(dataDir, { recursive: true }); } catch { /* já existe */ }

let cfg = {};
try { cfg = JSON.parse(readFileSync(path.join(dir, "config.json"), "utf8").replace(/^﻿/, "")); } catch { /* sem config: usa padrões */ }
const baseUrl = String(cfg.baseUrl || "").replace(/\/$/, "");
const token = cfg.token || "";
const portaHttp = Number(cfg.portaHttp) || 8544;
const pastaBase = cfg.pastaTef || "C:\\Cliente";
const pastaReq = cfg.pastaReq || path.join(pastaBase, "Req");
const pastaResp = cfg.pastaResp || path.join(pastaBase, "Resp");
const terminal = String(cfg.terminal || os.hostname()).slice(0, 8);
const timeoutVendaMs = Number(cfg.timeoutVendaMs) || 120000; // o cliente pode demorar pra achar o cartão
const timeoutStsMs = Number(cfg.timeoutStsMs) || 15000;      // o gerenciador tem que acusar recebimento rápido

const logFile = path.join(dataDir, "agente.log");
const estadoFile = path.join(dataDir, "estado.json");
function log(m) {
  const linha = `[${new Date().toLocaleString("pt-BR")}] ${m}`;
  console.log(linha);
  try { appendFileSync(logFile, linha + "\n"); } catch { /* sem log */ }
}
try { writeFileSync(path.join(dataDir, "agente.pid"), String(process.pid)); } catch { /* ok */ }
process.on("uncaughtException", (e) => log(`ERRO inesperado: ${e?.stack || e}`));
process.on("unhandledRejection", (e) => log(`ERRO (promise): ${e?.stack || e}`));

for (const p of [pastaReq, pastaResp]) { try { mkdirSync(p, { recursive: true }); } catch { /* ok */ } }

// ---------- estado: a transação em aberto (pra recuperar se o PC cair) ----------
let estado = { pendente: null, contador: 0 };
try { estado = { ...estado, ...JSON.parse(readFileSync(estadoFile, "utf8")) }; } catch { /* primeira vez */ }
function salvarEstado() { try { writeFileSync(estadoFile, JSON.stringify(estado, null, 2)); } catch { /* ok */ } }
function proximoId() {
  estado.contador = (Number(estado.contador) || 0) % 999999 + 1;
  salvarEstado();
  return String(estado.contador).padStart(6, "0");
}

// ---------- troca de arquivos ----------
const arqReq = path.join(pastaReq, "IntPos.001");
const arqSts = path.join(pastaResp, "IntPos.Sts");
const arqResp = path.join(pastaResp, "IntPos.001");
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
function apagar(p) { try { if (existsSync(p)) unlinkSync(p); } catch { /* ok */ } }
function lerArquivo(p) { try { return readFileSync(p, "latin1"); } catch { return null; } }

// Escreve com nome temporário e renomeia: o gerenciador nunca lê um arquivo pela metade.
function gravarReq(conteudo) {
  const tmp = arqReq + ".tmp";
  writeFileSync(tmp, conteudo, "latin1");
  try { unlinkSync(arqReq); } catch { /* não existia */ }
  renameSync(tmp, arqReq);
}

// Espera um arquivo existir e ficar estável; devolve o conteúdo (ou null se estourou).
async function esperarArquivo(p, ms, aoEsperar) {
  const inicio = Date.now();
  let ultimoTam = -1, estavel = 0;
  while (Date.now() - inicio < ms) {
    if (existsSync(p)) {
      let tam = 0;
      try { tam = readFileSync(p).length; } catch { tam = -1; }
      if (tam > 0 && tam === ultimoTam) { if (++estavel >= 2) return lerArquivo(p); }
      else estavel = 0;
      ultimoTam = tam;
    }
    aoEsperar?.(Date.now() - inicio);
    await dormir(150);
  }
  return null;
}

// Uma transação de cada vez: o pinpad é um só.
let ocupado = false;
let etapa = "livre"; // livre · enviando · aguardando_sts · no_pinpad · aguardando_confirmacao

async function executar(conteudoReq, { esperaResp = true, timeoutMs = timeoutVendaMs } = {}) {
  apagar(arqSts); apagar(arqResp);
  etapa = "enviando";
  gravarReq(conteudoReq);
  etapa = "aguardando_sts";
  const sts = await esperarArquivo(arqSts, timeoutStsMs);
  if (!sts) {
    apagar(arqReq);
    etapa = "livre";
    throw new Error("O TEF não respondeu (o gerenciador está aberto neste PC?).");
  }
  apagar(arqSts);
  if (!esperaResp) { etapa = "livre"; return null; }
  etapa = "no_pinpad";
  const resp = await esperarArquivo(arqResp, timeoutMs);
  if (!resp) {
    apagar(arqReq);
    etapa = "livre";
    throw new Error("Tempo esgotado esperando o cartão.");
  }
  apagar(arqResp);
  return interpretar(resp);
}

// Venda: devolve a resposta interpretada e deixa a transação PENDENTE de
// confirmação. O caixa chama /confirmar depois de gravar a venda.
async function venda(p) {
  const id = proximoId();
  const req = requisicaoVenda({ id, valor: p.valor, tipo: p.tipo, parcelas: p.parcelas, rede: p.rede, terminal, docFiscal: p.docFiscal });
  log(`Venda #${id}: R$ ${Number(p.valor).toFixed(2)} ${p.tipo || "qualquer"}${p.rede ? " · rede " + p.rede : ""}${p.parcelas > 1 ? " · " + p.parcelas + "x" : ""}`);
  const r = await executar(req);
  if (r.aprovada && r.requerConfirmacao) {
    estado.pendente = { id, finalizacao: r.finalizacao, valor: p.valor, nsu: r.nsu, desde: Date.now() };
    salvarEstado();
    etapa = "aguardando_confirmacao";
  } else {
    etapa = "livre";
  }
  log(`Venda #${id}: ${r.aprovada ? "APROVADA" : "NEGADA"} · NSU ${r.nsu ?? "-"} · aut ${r.autorizacao ?? "-"} · ${r.rede ?? ""} ${r.bandeira ?? ""} · ${r.mensagem}`);
  return { ...r, idAgente: id, terminal };
}

async function confirmar(id) {
  const pend = estado.pendente;
  if (!pend || (id && pend.id !== id)) return { ok: true, aviso: "nada pendente" };
  await executar(requisicaoConfirmar(pend.id, pend.finalizacao), { esperaResp: false });
  log(`Venda #${pend.id}: CONFIRMADA (CNF).`);
  estado.pendente = null; salvarEstado(); etapa = "livre";
  return { ok: true };
}

async function desfazer(id, motivo = "") {
  const pend = estado.pendente;
  if (!pend || (id && pend.id !== id)) return { ok: true, aviso: "nada pendente" };
  await executar(requisicaoDesfazer(pend.id, pend.finalizacao), { esperaResp: false });
  log(`Venda #${pend.id}: DESFEITA (NCN)${motivo ? " — " + motivo : ""}.`);
  estado.pendente = null; salvarEstado(); etapa = "livre";
  return { ok: true };
}

// Ao ligar: se ficou uma venda aprovada sem confirmação (o PC caiu no meio),
// desfaz — a regra é "sem venda gravada, sem cobrança".
async function recuperar() {
  if (!estado.pendente) return;
  log(`Achei a venda #${estado.pendente.id} aprovada sem confirmação (de ${new Date(estado.pendente.desde).toLocaleString("pt-BR")}). Desfazendo.`);
  try { await desfazer(); } catch (e) { log(`Não consegui desfazer agora: ${e.message}. Tento de novo na próxima venda.`); }
}

// ---------- servidor local pro caixa ----------
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const json = (res, status, obj) => { res.writeHead(status, { ...cors, "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
function corpo(req) {
  return new Promise((resolve, reject) => {
    let s = "";
    req.on("data", (c) => { s += c; if (s.length > 20000) req.destroy(); });
    req.on("end", () => { try { resolve(s ? JSON.parse(s) : {}); } catch { reject(new Error("JSON inválido")); } });
  });
}
const gerenciadorPresente = () => existsSync(pastaReq) && existsSync(pastaResp);

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
  const url = req.url || "/";

  if (req.method === "GET" && url === "/status") {
    return json(res, 200, {
      ok: true, versao: VERSAO, terminal, hostname: os.hostname(), etapa, ocupado,
      gerenciador: gerenciadorPresente(), pastaReq, pastaResp,
      pendente: estado.pendente ? { id: estado.pendente.id, valor: estado.pendente.valor, nsu: estado.pendente.nsu } : null,
    });
  }

  if (req.method === "POST" && (url === "/venda" || url === "/confirmar" || url === "/desfazer" || url === "/cancelar" || url === "/adm")) {
    if (ocupado) return json(res, 409, { ok: false, erro: "Já tem uma operação em andamento no pinpad." });
    ocupado = true;
    try {
      const p = await corpo(req);
      if (url === "/venda") {
        if (!(Number(p.valor) > 0)) return json(res, 400, { ok: false, erro: "Valor inválido." });
        if (estado.pendente) await desfazer(undefined, "venda anterior ficou sem confirmação");
        const r = await venda(p);
        return json(res, 200, { ok: true, ...r });
      }
      if (url === "/confirmar") return json(res, 200, await confirmar(p.id));
      if (url === "/desfazer") return json(res, 200, await desfazer(p.id, p.motivo));
      if (url === "/cancelar") {
        const id = proximoId();
        log(`Cancelamento #${id}: NSU ${p.nsu} R$ ${Number(p.valor).toFixed(2)} de ${p.data}`);
        const r = await executar(requisicaoCancelar({ id, valor: p.valor, nsu: p.nsu, data: p.data, terminal }));
        if (r.requerConfirmacao) await executar(requisicaoConfirmar(id, r.finalizacao), { esperaResp: false });
        etapa = "livre";
        return json(res, 200, { ok: true, ...r, idAgente: id });
      }
      if (url === "/adm") {
        const id = proximoId();
        const r = await executar(requisicaoAdm(id, terminal));
        etapa = "livre";
        return json(res, 200, { ok: true, ...r });
      }
    } catch (e) {
      etapa = "livre";
      log(`Falha: ${e.message}`);
      return json(res, 200, { ok: false, erro: e.message });
    } finally {
      ocupado = false;
    }
  }

  // Última resposta crua da pasta (diagnóstico).
  if (req.method === "GET" && url === "/raw") {
    const arquivos = {};
    for (const [nome, p] of [["req", arqReq], ["sts", arqSts], ["resp", arqResp]]) arquivos[nome] = lerArquivo(p);
    let listaResp = [];
    try { listaResp = readdirSync(pastaResp); } catch { /* ok */ }
    return json(res, 200, { ok: true, arquivos, listaResp, estado });
  }

  json(res, 404, { ok: false, erro: "rota desconhecida" });
});

server.on("error", (e) => {
  log(`Não consegui abrir a porta ${portaHttp}: ${e.message} (outro agente rodando?)`);
  process.exit(1);
});
server.listen(portaHttp, "127.0.0.1", () => {
  log(`Agente TEF v${VERSAO} no ar em http://localhost:${portaHttp} · terminal ${terminal} · pastas ${pastaReq} / ${pastaResp}${gerenciadorPresente() ? "" : " (pastas do TEF ainda não existem — instale o gerenciador ou rode o simulador)"}`);
  recuperar();
});

// Heartbeat: o sistema mostra qual PC está com TEF ativo.
async function heartbeat() {
  if (!baseUrl || !token) return;
  try {
    await fetch(`${baseUrl}/api/tef/status`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ hostname: os.hostname(), terminal, versao: VERSAO, gerenciador: gerenciadorPresente(), etapa }),
      signal: AbortSignal.timeout(8000),
    });
  } catch { /* silencioso */ }
}
setInterval(heartbeat, 30000);
setTimeout(heartbeat, 2000);

