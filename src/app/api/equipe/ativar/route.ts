import { createAdminClient } from "@/lib/supabase/admin";
import { bloqueado, corsAtivacao, dominioOk, ipDe, lerCodigo, registrarTentativa } from "@/lib/ativacao-codigo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// CÓDIGO DE ENTRADA → LINK DO APP DA EQUIPE (Motelli Equipe, migration 0232).
// Mesma regra do entregador (src/app/api/entrega/ativar): o app pergunta aqui,
// sempre em motelli.com.br, e recebe https://{domínio da empresa}/eu/{token}.
const resposta = (corpo: unknown, status = 200) => Response.json(corpo, { status, headers: corsAtivacao });

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsAtivacao });
}

export async function POST(req: Request) {
  const ip = ipDe(req);
  const codigo = await lerCodigo(req);
  if (!/^\d{6}$/.test(codigo)) return resposta({ erro: "O código tem 6 números." }, 400);

  const admin = createAdminClient();
  if (await bloqueado(admin, ip)) {
    return resposta({ erro: "Muitas tentativas erradas. Espere 15 minutos ou use o QR code do painel." }, 429);
  }

  // O código vale uma vez e por 7 dias (migration 0280, auditoria SEC-05).
  const { data } = await admin
    .from("colaboradores")
    .select("id, token, ativo, empresas(dominio, ativo)")
    .eq("codigo", codigo)
    .gt("codigo_ate", new Date().toISOString())
    .maybeSingle();
  const c = data as { id: string; token: string | null; ativo: boolean; empresas: { dominio: string | null; ativo: boolean } | null } | null;
  const dominio = String(c?.empresas?.dominio ?? "").trim().toLowerCase();
  const ok = !!(c?.ativo && c.token && c.empresas?.ativo !== false && dominioOk(dominio));

  await registrarTentativa(admin, ip, ok);
  if (!ok) return resposta({ erro: "Código não encontrado ou vencido. Peça um código novo à gerência." }, 404);
  await admin.from("colaboradores").update({ codigo: null, codigo_ate: null }).eq("id", c!.id);
  return resposta({ url: `https://${dominio}/eu/${c!.token}` });
}
