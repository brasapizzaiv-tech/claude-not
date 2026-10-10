// Regras do ponto (migration 0221). Sem import nenhum: o servidor e os testes
// (scripts/ponto.test.mjs) usam igual.

export type BatidaAfd = { nsr: number; dataHora: string; cpf: string };

/** "2026-10-10T08:35:00-0300" → "2026-10-10T08:35:00-03:00" (ISO de verdade). */
function isoComDoisPontos(s: string) {
  return s.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
}

/**
 * Lê as marcações de um AFD da Portaria 671 (texto do relógio).
 * Registro tipo 7 (REP-P) e tipo 3 (REP-C): NSR nas colunas 1–9, tipo na 10,
 * data e hora nas 11–34 ("AAAA-MM-DDThh:mm:ss-zzzz"), CPF nas 35–46.
 * Linhas de outros tipos (cabeçalho, empresa, ajuste de relógio) são ignoradas.
 */
export function lerAfd(texto: string): BatidaAfd[] {
  const saida: BatidaAfd[] = [];
  for (const bruta of texto.split(/\r?\n/)) {
    const l = bruta.replace(/^﻿/, "");
    if (l.length < 46) continue;
    const tipo = l[9];
    if (tipo !== "7" && tipo !== "3") continue;
    const nsr = Number(l.slice(0, 9));
    const dh = l.slice(10, 34);
    const cpf = l.slice(34, 46).replace(/\D/g, "");
    if (!Number.isFinite(nsr) || nsr <= 0) continue;
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?[+-]\d{2}:?\d{2}$/.test(dh)) continue;
    if (cpf.length < 11) continue;
    saida.push({ nsr, dataHora: isoComDoisPontos(dh), cpf: cpf.slice(-11) });
  }
  return saida;
}

function diaAnterior(dia: string) {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d - 1)).toISOString().slice(0, 10);
}

/**
 * Turno da batida, pela hora LOCAL escrita no AFD: antes das 16h = dia; das
 * 16h em diante = noite; da meia-noite às 04:59 = noite do dia anterior (a
 * saída de quem fecha depois da meia-noite).
 */
export function turnoDaBatida(dataHoraLocal: string): { data: string; turno: "dia" | "noite" } {
  const dia = dataHoraLocal.slice(0, 10);
  const hora = Number(dataHoraLocal.slice(11, 13));
  if (hora < 5) return { data: diaAnterior(dia), turno: "noite" };
  if (hora < 16) return { data: dia, turno: "dia" };
  return { data: dia, turno: "noite" };
}

/** Nome comparável: sem acento, minúsculo, um espaço só. */
export function nomeComparavel(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Liga um nome do relógio a um colaborador sem CPF: nome igual, ou o nome do
 * cadastro contido no do relógio ("Ana Paula" ⊂ "Ana Paula Souza"). Só liga
 * se der UMA pessoa — na dúvida não liga, e a batida fica "sem colaborador".
 */
export function acharPorNome<T extends { nome: string }>(nomeRelogio: string, candidatos: T[]): T | null {
  const alvo = nomeComparavel(nomeRelogio);
  if (!alvo) return null;
  const iguais = candidatos.filter((c) => nomeComparavel(c.nome) === alvo);
  if (iguais.length === 1) return iguais[0];
  if (iguais.length > 1) return null;
  const contidos = candidatos.filter((c) => {
    const n = nomeComparavel(c.nome);
    return n.length >= 3 && (` ${alvo} `).includes(` ${n} `);
  });
  return contidos.length === 1 ? contidos[0] : null;
}

export const soDigitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
