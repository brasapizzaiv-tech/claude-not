import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// CÓDIGO DE ENTRADA → ENDEREÇO DO APP DO ENTREGADOR
//
// O app da loja é um só pra todos os clientes. Na tela inicial o motoboy digita
// o código de 6 números que aparece no painel (Delivery → Entregadores) e o app
// pergunta aqui, sempre em motelli.com.br, pra onde ir: devolve o link pessoal
// dele (https://{domínio da empresa}/entrega/{token}). Migration 0227.
//
// 6 números são só 1 milhão de combinações, e o que sai daqui é o link pessoal.
// Por isso conta os erros: 10 por aparelho/IP em 15 min, ou 300 no total
// (alguém chutando de vários lugares), e fecha a porta por um tempo.

const JANELA_MS = 15 * 60 * 1000;
const MAX_ERROS_IP = 10;
const MAX_ERROS_TOTAL = 300;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};
const resposta = (corpo: unknown, status = 200) => Response.json(corpo, { status, headers: cors });

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}

export async function POST(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "?";
  let codigo = "";
  try { codigo = String(((await req.json()) as { codigo?: unknown })?.codigo ?? "").replace(/\D/g, ""); } catch { /* corpo inválido */ }
  if (!/^\d{6}$/.test(codigo)) return resposta({ erro: "O código tem 6 números." }, 400);

  const admin = createAdminClient();
  const desde = new Date(Date.now() - JANELA_MS).toISOString();
  const [{ count: errosIp }, { count: errosTotal }] = await Promise.all([
    admin.from("entrega_ativacao_tentativas").select("id", { count: "exact", head: true }).eq("ip", ip).eq("ok", false).gte("em", desde),
    admin.from("entrega_ativacao_tentativas").select("id", { count: "exact", head: true }).eq("ok", false).gte("em", desde),
  ]);
  if ((errosIp ?? 0) >= MAX_ERROS_IP || (errosTotal ?? 0) >= MAX_ERROS_TOTAL) {
    return resposta({ erro: "Muitas tentativas erradas. Espere 15 minutos ou use o QR code do painel." }, 429);
  }

  const { data } = await admin
    .from("entregadores")
    .select("token, ativo, empresas(dominio, ativo)")
    .eq("codigo", codigo)
    .maybeSingle();
  const e = data as { token: string | null; ativo: boolean; empresas: { dominio: string | null; ativo: boolean } | null } | null;
  const dominio = String(e?.empresas?.dominio ?? "").trim().toLowerCase();
  const ok = !!(e?.ativo && e.token && e.empresas?.ativo !== false && /^[a-z0-9.-]+\.[a-z]{2,}$/.test(dominio));

  await admin.from("entrega_ativacao_tentativas").insert({ ip, ok });
  // Faxina: tentativas com mais de 1 dia não servem pra nada.
  if (Math.random() < 0.05) await admin.from("entrega_ativacao_tentativas").delete().lt("em", new Date(Date.now() - 86400000).toISOString());

  if (!ok) return resposta({ erro: "Código não encontrado. Confira os números com a gerência." }, 404);
  return resposta({ url: `https://${dominio}/entrega/${e!.token}` });
}
