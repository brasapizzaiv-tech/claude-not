import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./config";

// Cliente administrativo (service_role) — SOMENTE no servidor.
// Ignora as regras de segurança (RLS). Usar com cuidado, para tarefas como
// importação em massa, criação de usuários e o preenchimento público da
// contagem (validado por token). A chave secreta vem de variável de ambiente.
export function createAdminClient() {
  return createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
