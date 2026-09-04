import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CentralImpressao, type Impressora } from "./central";

export const metadata = { title: "Central de Impressões · Brasa" };

export default async function CentralImpressaoPage() {
  const supabase = await createClient();
  const [{ data }, { data: prods }] = await Promise.all([
    supabase.from("impressoras").select("id, nome, ativo, impressora_windows, recebe_comandas, recebe_marmitas, comanda_produtos, comanda_config, etiqueta_config").order("criado_em"),
    supabase.from("pdv_itens").select("id, nome, categoria").eq("ativo", true).order("categoria").order("nome"),
  ]);
  const produtos = ((prods as { id: string; nome: string; categoria: string | null }[]) ?? []).map((p) => ({
    id: p.id, nome: p.nome, categoria: p.categoria || "Outros",
  }));

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
      produtos={produtos}
      token={(cfg?.token as string) ?? ""}
      hostname={(cfg?.hostname as string) ?? null}
      printersPc={(cfg?.printers as string[]) ?? []}
      online={online}
      vistoEm={vistoEm}
    />
  );
}
