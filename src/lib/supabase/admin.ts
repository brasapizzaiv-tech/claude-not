import { createClient } from "@supabase/supabase-js";

// Cliente administrativo (service_role) — SOMENTE no servidor.
// Ignora as regras de segurança (RLS). Usar com cuidado, para tarefas como
// importação em massa e criação de usuários.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
