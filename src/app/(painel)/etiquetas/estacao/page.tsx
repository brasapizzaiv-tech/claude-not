import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { EstacaoHub, type Impressora } from "./hub";

export const metadata = { title: "Estações de impressão · Brasa" };

export default async function EstacoesPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("impressoras")
    .select("id, nome, ativo, impressora_windows")
    .order("criado_em");

  // token do agente (leitura só pelo servidor)
  const admin = createAdminClient();
  const { data: cfg } = await admin.from("impressao_config").select("token").eq("id", 1).maybeSingle();

  return <EstacaoHub impressoras={(data as Impressora[]) ?? []} token={(cfg?.token as string) ?? ""} />;
}
