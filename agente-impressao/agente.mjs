// Agente de impressão da Brasa — roda no PC central.
// Ele fica de olho na fila de etiquetas do sistema e manda cada uma para a
// impressora certa do Windows (pelo nome). Não precisa abrir janela.
import ptp from "pdf-to-printer";
import { writeFile, mkdir } from "node:fs/promises";
import { readFileSync, appendFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { print } = ptp;
const dir = path.dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(readFileSync(path.join(dir, "config.json"), "utf8").replace(/^﻿/, ""));
const baseUrl = String(cfg.baseUrl || "").replace(/\/$/, "");
const token = cfg.token || "";
const intervalo = Number(cfg.intervaloMs) || 3000;
const headers = { Authorization: `Bearer ${token}` };
const tmp = path.join(os.tmpdir(), "brasa-etiquetas");
const logFile = path.join(dir, "agente.log");

function log(m) {
  const t = new Date().toLocaleString("pt-BR");
  const linha = `[${t}] ${m}`;
  console.log(linha);
  try { appendFileSync(logFile, linha + "\n"); } catch { /* sem log em arquivo */ }
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
        const pr = await fetch(`${baseUrl}/api/impressao/etiqueta/${job.id}`, { headers });
        if (!pr.ok) { log(`Erro ao gerar o PDF (${pr.status}).`); continue; }
        const buf = Buffer.from(await pr.arrayBuffer());
        const file = path.join(tmp, `${job.id}.pdf`);
        await writeFile(file, buf);
        await print(file, { printer: job.printer, scale: "noscale" });
        await fetch(`${baseUrl}/api/impressao/baixa`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ id: job.id }),
        });
        log(`Etiqueta impressa em "${job.printer}".`);
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

try { writeFileSync(path.join(dir, "agente.pid"), String(process.pid)); } catch { /* ok */ }
log("Agente de impressão iniciado.");
log(`Servidor: ${baseUrl || "(vazio!)"}`);
if (!token) log("ATENÇÃO: token vazio no config.json.");
await mkdir(tmp, { recursive: true });
setInterval(ciclo, intervalo);
ciclo();
