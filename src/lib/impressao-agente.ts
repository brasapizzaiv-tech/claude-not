import { createAdminClient } from "@/lib/supabase/admin";

// De qual restaurante é o agente que está batendo à porta.
//
// Antes isto só respondia sim ou não, comparando com o token da linha 1 de
// `impressao_config` — que era a única que existia. Agora cada restaurante tem
// a linha dele, com o token dele, então o PRÓPRIO TOKEN diz de quem é o PC.
//
// É a decisão 6 do multiempresa ("instalador que pede um código da loja")
// resolvida onde ela importa: o agente não precisa saber de empresa nenhuma,
// só do código que já carrega.
export async function empresaDoAgente(req: Request): Promise<string | null> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("impressao_config")
    .select("empresa_id")
    .eq("token", token)
    .maybeSingle();
  return (data?.empresa_id as string | undefined) ?? null;
}

/** Só sim ou não, pra quem não precisa saber de qual loja é. */
export async function agenteAutorizado(req: Request): Promise<boolean> {
  return (await empresaDoAgente(req)) !== null;
}
