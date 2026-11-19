import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { bloqueado, corsAtivacao, dominioOk, ipDe, lerCodigo, registrarTentativa } from "@/lib/ativacao-codigo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// CÓDIGO DE ENTRADA → LINK DO APP DA EQUIPE (Motelli Equipe, migration 0232).
// Mesma regra do entregador (src/app/api/entrega/ativar): o app pergunta aqui,
// sempre em motelli.com.br, e recebe https://{domínio da empresa}/eu/{token}.
const resposta = (corpo: unknown, status = 200) => Response.json(corpo, { status, headers: corsAtivacao });

type Achado = { id: string; token: string | null; ativo: boolean; empresas: { dominio: string | null; ativo: boolean } | null };
type Admin = ReturnType<typeof createAdminClient>;

// UM CÓDIGO, DOIS BANCOS (decisão 2 do multiempresa): o app só conhece este
// endereço, mas quem é do banco dos CLIENTES (Beeis, ...) tem o colaborador lá.
// Este projeto (o da Brasa) olha o próprio banco e, sem achar, o dos clientes —
// pelas variáveis CLIENTES_BANCO_URL e CLIENTES_SERVICE_ROLE_KEY (só servidor).
function bancoClientes(): Admin | null {
  const url = process.env.CLIENTES_BANCO_URL?.trim();
  const chave = process.env.CLIENTES_SERVICE_ROLE_KEY?.trim();
  if (!url || !chave) return null;
  return createClient(url, chave, { auth: { autoRefreshToken: false, persistSession: false } }) as unknown as Admin;
}

// O código vale uma vez e por 7 dias (migration 0280, auditoria SEC-05).
async function procurar(db: Admin, codigo: string): Promise<Achado | null> {
  const { data } = await db
    .from("colaboradores")
    .select("id, token, ativo, empresas(dominio, ativo)")
    .eq("codigo", codigo)
    .gt("codigo_ate", new Date().toISOString())
    .maybeSingle();
  return (data as Achado | null) ?? null;
}

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

  let banco: Admin = admin;
  let c = await procurar(admin, codigo);
  if (!c) {
    const clientes = bancoClientes();
    if (clientes) {
      c = await procurar(clientes, codigo).catch(() => null);
      if (c) banco = clientes;
    }
  }
  const dominio = String(c?.empresas?.dominio ?? "").trim().toLowerCase();
  const ok = !!(c?.ativo && c.token && c.empresas?.ativo !== false && dominioOk(dominio));

  await registrarTentativa(admin, ip, ok);
  if (!ok) return resposta({ erro: "Código não encontrado ou vencido. Peça um código novo à gerência." }, 404);
  await banco.from("colaboradores").update({ codigo: null, codigo_ate: null }).eq("id", c!.id);
  return resposta({ url: `https://${dominio}/eu/${c!.token}` });
}
