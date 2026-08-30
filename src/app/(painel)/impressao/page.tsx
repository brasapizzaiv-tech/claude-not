import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CentralImpressao, type Impressora } from "./central";

export const metadata = { title: "Central de Impressões · Brasa" };

export default async function CentralImpressaoPage() {
  const supabase = await createClient();
  const [{ data }, { data: cats }] = await Promise.all([
    supabase.from("impressoras").select("id, nome, ativo, impressora_windows, recebe_comandas, comanda_categorias").order("criado_em"),
    supabase.from("pdv_categorias").select("nome").order("nome"),
  ]);
  const categorias = ((cats as { nome: string }[]) ?? []).map((c) => c.nome);

  const admin = createAdminClient();
  const { data: cfg } = await admin
    .from("impressao_config")
    .select("token, hostname, printers, visto_em")
    .eq("id", 1)
    .maybeSingle();

  const vistoEm = (cfg?.visto_em as string) ?? null;
  const online = vistoEm ? new Date().getTime() - new Date(vistoEm).getTime() < 40000 : false;

  return (
    <CentralImpressao
      impressoras={(data as Impressora[]) ?? []}
      categorias={categorias}
      token={(cfg?.token as string) ?? ""}
      hostname={(cfg?.hostname as string) ?? null}
      printersPc={(cfg?.printers as string[]) ?? []}
      online={online}
      vistoEm={vistoEm}
    />
  );
}
