// Relógio de ponto (Control iD iDFace, REP-P) — parte do agente do PC central.
//
// A cada N minutos: entra no relógio pela rede da Brasa, pega as batidas NOVAS
// (a partir do último NSR que o sistema já tem) no formato AFD da Portaria 671
// e manda pro sistema (/api/ponto/batidas), junto com nome e CPF dos usuários
// do relógio (pra ligar a pessoa na primeira vez). Não mexe no iDCloud/RHiD:
// só LÊ o relógio, como a tela "Relatórios > AFD" dele faz.
//
// Configuração: %ProgramData%\AgenteImpressao\relogio.json
//   { "host": "192.168.1.129", "usuario": "...", "senha": "...", "intervaloMin": 5 }
// (o menu do ícone "Relógio de ponto..." grava esse arquivo). Sem ele, nada roda.
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const LOTE = 500; // o relógio exporta em páginas de 500, igual à tela dele

export function iniciarPonto({ dataDir, baseUrl, headers, log }) {
  const arq = path.join(dataDir, "relogio.json");
  if (!existsSync(arq)) { log("Relógio de ponto: não configurado (menu do ícone > Relógio de ponto)."); return; }
  let cfg;
  try { cfg = JSON.parse(readFileSync(arq, "utf8").replace(/^﻿/, "")); } catch (e) { log(`Relógio de ponto: relogio.json inválido (${e.message}).`); return; }
  const host = String(cfg.host || "").trim();
  if (!host || !cfg.usuario) { log("Relógio de ponto: falta o IP ou o usuário em relogio.json."); return; }
  const base = /^https?:\/\//.test(host) ? host.replace(/\/$/, "") : `http://${host}`;
  const intervalo = Math.max(1, Number(cfg.intervaloMin) || 5) * 60000;
  let rodando = false;

  async function chamar(cmd, sessao, corpo) {
    const url = `${base}/${cmd}.fcgi${sessao ? `?session=${encodeURIComponent(sessao)}` : ""}`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo ?? {}),
      signal: AbortSignal.timeout(20000),
    });
    const texto = await r.text();
    if (!r.ok) throw new Error(`${cmd}: HTTP ${r.status} ${texto.slice(0, 120)}`);
    return texto;
  }
  const json = (t) => { try { return JSON.parse(t); } catch { return {}; } };

  async function sincronizar() {
    if (rodando) return;
    rodando = true;
    let sessao = null;
    try {
      sessao = json(await chamar("login", null, { login: cfg.usuario, password: cfg.senha ?? "" })).session;
      if (!sessao) throw new Error("login recusado (confira usuário e senha do relógio)");

      const info = json(await chamar("system_information", sessao, {}));
      const equipamento = String(info.serial || info.device_id || host).trim();

      const r0 = await fetch(`${baseUrl}/api/ponto/batidas?equipamento=${encodeURIComponent(equipamento)}`, { headers, signal: AbortSignal.timeout(20000) });
      if (!r0.ok) throw new Error(`sistema respondeu ${r0.status} ao pedir o último NSR`);
      const ultimo = Number((await r0.json()).ultimoNsr) || 0;

      const total = Number(json(await chamar("count_registers", sessao, {})).log_number) || 0;
      const faltam = total - ultimo;
      if (faltam <= 0) return;

      // Usuários do relógio (nome + CPF) — pra ligar a pessoa na primeira vez.
      let usuarios = [];
      try {
        const u = json(await chamar("load_objects", sessao, { object: "users" }));
        usuarios = (u.users || []).map((x) => ({ cpf: String(x.cpf ?? x.registration ?? ""), nome: String(x.name ?? "") })).filter((x) => x.cpf);
      } catch (e) { log(`Relógio de ponto: não li os usuários (${e.message}).`); }

      let enviadas = 0;
      for (let offset = 0; offset < faltam; offset += LOTE) {
        const afd = await chamar("export_afd", sessao, { initial_nsr: ultimo + 1, mode: 671, offset, limit: LOTE });
        const r = await fetch(`${baseUrl}/api/ponto/batidas`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ equipamento, afd, usuarios: offset === 0 ? usuarios : [] }),
          signal: AbortSignal.timeout(60000),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.ok) throw new Error(`sistema recusou: ${j.erro || r.status}`);
        enviadas += j.novas || 0;
        if (j.semColaborador) log(`Relógio de ponto: ${j.semColaborador} batida(s) sem colaborador ligado (cadastre o CPF em Colaboradores).`);
      }
      log(`Relógio de ponto: ${enviadas} batida(s) nova(s) enviada(s).`);
    } catch (e) {
      log(`Relógio de ponto: ${e.message}`);
    } finally {
      if (sessao) { try { await chamar("logout", sessao, {}); } catch { /* ok */ } }
      rodando = false;
    }
  }

  log(`Relógio de ponto: lendo ${base} a cada ${intervalo / 60000} min.`);
  setTimeout(sincronizar, 15000);
  setInterval(sincronizar, intervalo);
}
