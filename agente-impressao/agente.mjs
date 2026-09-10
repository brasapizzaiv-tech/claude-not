// Agente de impressão da Brasa — roda no PC central (um só: as impressoras
// são de rede e ficam todas instaladas no Windows desse PC).
// Fica de olho na fila do sistema (etiquetas, comandas de cozinha, cupom da
// NFC-e, marmitas) e manda cada job para a impressora certa, pelo nome.
import ptp from "pdf-to-printer";
import { writeFile, mkdir } from "node:fs/promises";
import { readFileSync, appendFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { print } = ptp;
const VERSAO = "1.1.3"; // 1.1.2: sempre em retrato; 1.1.3: a escala vem do servidor (documento já sai na medida da impressora, imprime 1:1)
const dir = path.dirname(fileURLToPath(import.meta.url));
// Onde o agente pode ESCREVER (Program Files é só leitura pro usuário comum).
const dataDir = process.env.ProgramData ? path.join(process.env.ProgramData, "AgenteImpressao") : dir;
try { mkdirSync(dataDir, { recursive: true }); } catch { /* já existe */ }
const cfg = JSON.parse(readFileSync(path.join(dir, "config.json"), "utf8").replace(/^﻿/, ""));
const baseUrl = String(cfg.baseUrl || "").replace(/\/$/, "");
const token = cfg.token || "";
const intervalo = Number(cfg.intervaloMs) || 3000;
const headers = { Authorization: `Bearer ${token}` };
const tmp = path.join(os.tmpdir(), "brasa-etiquetas");
const logFile = path.join(dataDir, "agente.log");

function log(m) {
  const t = new Date().toLocaleString("pt-BR");
  const linha = `[${t}] ${m}`;
  console.log(linha);
  try { appendFileSync(logFile, linha + "\n"); } catch { /* sem log em arquivo */ }
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

// Avisa o sistema que está online e manda a lista de impressoras deste PC.
async function heartbeat() {
  try {
    const printers = await listarImpressoras();
    await fetch(`${baseUrl}/api/impressao/heartbeat`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ hostname: os.hostname(), printers }),
    });
  } catch { /* silencioso */ }
}

let rodando = false;
async function ciclo() {
  if (rodando) return;
  rodando = true;
  try {
    const r = await fetch(`${baseUrl}/api/impressao/fila`, { headers });
    if (r.status === 401) { log("Token inválido — confira o config.json (copie de Etiquetas → Estações)."); return; }
    if (!r.ok) { log(`Erro ao buscar a fila (${r.status}).`); return; }
    const { jobs } = await r.json();
    for (const job of jobs) {
      if (!job.printer) {
        log(`Impressora "${job.impressora || "?"}" sem "Nome no Windows" — pulei. Configure em Etiquetas → Estações.`);
        continue;
      }
      try {
        const pr = await fetch(`${baseUrl}${job.url}`, { headers });
        if (!pr.ok) { log(`Erro ao gerar o PDF (${pr.status}).`); continue; }
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
        if (!etiqueta) opcoes.orientation = job.orientacao === "landscape" ? "landscape" : "portrait";
        await print(file, opcoes);
        await fetch(`${baseUrl}/api/impressao/baixa`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ id: job.id }),
        });
        log(`Impresso em "${job.printer}".`);
      } catch (e) {
        log(`Falha ao imprimir: ${e.message}`);
      }
    }
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
setInterval(ciclo, intervalo);
ciclo();
heartbeat();
setInterval(heartbeat, 15000);
