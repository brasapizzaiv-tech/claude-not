import { createAdminClient } from "@/lib/supabase/admin";

// Valida o token do agente de impressão (cabeçalho Authorization: Bearer ...).
export async function agenteAutorizado(req: Request): Promise<boolean> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;
  const admin = createAdminClient();
  const { data } = await admin.from("impressao_config").select("token").eq("id", 1).maybeSingle();
  return !!data?.token && data.token === token;
}
