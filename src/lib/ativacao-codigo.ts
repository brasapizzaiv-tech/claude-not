// Entrada por código de 6 números nos apps Motelli (Entregador e Equipe).
// O app da loja é um só pra todos os clientes; o código vira o link pessoal
// em motelli.com.br/api/{entrega|equipe}/ativar. 6 números são só 1 milhão de
// combinações, e o que sai daqui é o link pessoal — por isso conta os erros:
// 10 por aparelho/IP em 15 min, ou 300 no total, e fecha a porta por um tempo.
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

const JANELA_MS = 15 * 60 * 1000;
const MAX_ERROS_IP = 10;
const MAX_ERROS_TOTAL = 300;

export const corsAtivacao = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

export function ipDe(req: Request) {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "?";
}

export async function lerCodigo(req: Request) {
  try { return String(((await req.json()) as { codigo?: unknown })?.codigo ?? "").replace(/\D/g, ""); } catch { return ""; }
}

/** true = muitas tentativas erradas; não deixa nem procurar. */
export async function bloqueado(admin: Admin, ip: string) {
  const desde = new Date(Date.now() - JANELA_MS).toISOString();
  const [{ count: errosIp }, { count: errosTotal }] = await Promise.all([
    admin.from("entrega_ativacao_tentativas").select("id", { count: "exact", head: true }).eq("ip", ip).eq("ok", false).gte("em", desde),
    admin.from("entrega_ativacao_tentativas").select("id", { count: "exact", head: true }).eq("ok", false).gte("em", desde),
  ]);
  return (errosIp ?? 0) >= MAX_ERROS_IP || (errosTotal ?? 0) >= MAX_ERROS_TOTAL;
}

export async function registrarTentativa(admin: Admin, ip: string, ok: boolean) {
  await admin.from("entrega_ativacao_tentativas").insert({ ip, ok });
  // Faxina: tentativas com mais de 1 dia não servem pra nada.
  if (Math.random() < 0.05) await admin.from("entrega_ativacao_tentativas").delete().lt("em", new Date(Date.now() - 86400000).toISOString());
}

/** Domínio válido pra montar o link (vai parar na barra de endereço do app). */
export const dominioOk = (d: string) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d);
