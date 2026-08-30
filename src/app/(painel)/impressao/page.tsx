import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CentralImpressao, type Impressora } from "./central";

export const metadata = { title: "Central de Impressões · Brasa" };

export default async function CentralImpressaoPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("impressoras")
    .select("id, nome, ativo, impressora_windows")
    .order("criado_em");

  const admin = createAdminClient();
  const { data: cfg } = await admin.from("impressao_config").select("token").eq("id", 1).maybeSingle();

  return <CentralImpressao impressoras={(data as Impressora[]) ?? []} token={(cfg?.token as string) ?? ""} />;
}
