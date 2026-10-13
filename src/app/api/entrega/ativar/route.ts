import { createAdminClient } from "@/lib/supabase/admin";
import { bloqueado, corsAtivacao, dominioOk, ipDe, lerCodigo, registrarTentativa } from "@/lib/ativacao-codigo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// CÓDIGO DE ENTRADA → ENDEREÇO DO APP DO ENTREGADOR
//
// O app da loja é um só pra todos os clientes. Na tela inicial o motoboy digita
// o código de 6 números que aparece no painel (Delivery → Entregadores) e o app
// pergunta aqui, sempre em motelli.com.br, pra onde ir: devolve o link pessoal
// dele (https://{domínio da empresa}/entrega/{token}). Migration 0227.
// A trava contra chute é a mesma do app da equipe (src/lib/ativacao-codigo.ts).
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

  const { data } = await admin
    .from("entregadores")
    .select("token, ativo, empresas(dominio, ativo)")
    .eq("codigo", codigo)
    .maybeSingle();
  const e = data as { token: string | null; ativo: boolean; empresas: { dominio: string | null; ativo: boolean } | null } | null;
  const dominio = String(e?.empresas?.dominio ?? "").trim().toLowerCase();
  const ok = !!(e?.ativo && e.token && e.empresas?.ativo !== false && dominioOk(dominio));

  await registrarTentativa(admin, ip, ok);
  if (!ok) return resposta({ erro: "Código não encontrado. Confira os números com a gerência." }, 404);
  return resposta({ url: `https://${dominio}/entrega/${e!.token}` });
}
