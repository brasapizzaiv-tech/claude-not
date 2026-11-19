import Link from "next/link";
import { Icone } from "@/components/icone";
import { createAdminClient } from "@/lib/supabase/admin";
import { adminDaEmpresa } from "@/lib/supabase/admin-empresa";
import type { ItemEtq, CatEtq } from "@/components/etiqueta-ui";
import type { EtiquetaConfig } from "@/lib/etiqueta-tipos";
import { EtiquetaColabForm } from "./form";

export const metadata = { title: "Nova etiqueta" };

export default async function NovaEtiquetaColabPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();
  const { data: colab } = await admin
    .from("colaboradores")
    .select("nome, ativo, faz_etiquetas, empresa_id")
    .eq("token", token)
    .maybeSingle();

  if (!colab || !colab.ativo || !colab.faz_etiquetas) {
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <p className="text-texto-suave">Você não tem acesso a etiquetas.</p>
        <Link href={`/eu/${token}`} className="mt-3 inline-block text-sm text-orange-600">← Voltar</Link>
      </div>
    );
  }

  const db = adminDaEmpresa(colab.empresa_id as string, admin);
  const [{ data: its }, { data: cats }, { data: recs }, { data: imps }] = await Promise.all([
    db
      .from("etiqueta_itens")
      .select("id, nome, categoria_id, validade_congelado, validade_resfriado, validade_ambiente, unidade")
      .eq("ativo", true)
      .order("nome"),
    db.from("etiqueta_categorias").select("id, nome").eq("ativo", true).order("ordem").order("nome"),
    db.from("etiquetas").select("item_id").not("item_id", "is", null).order("criado_em", { ascending: false }).limit(80),
    db.from("impressoras").select("etiqueta_config").eq("ativo", true).order("criado_em").limit(1),
  ]);
  const recentes = [...new Set(((recs as { item_id: string }[]) ?? []).map((r) => r.item_id))];
  const config = ((imps as { etiqueta_config: EtiquetaConfig | null }[] | null)?.[0]?.etiqueta_config) ?? null;

  return (
    <div className="mx-auto min-h-screen max-w-md bg-superficie-suave p-4">
      <Link href={`/eu/${token}`} className="text-sm text-texto-suave">← Voltar</Link>
      <h1 className="mt-2 mb-1 text-xl font-bold text-texto"><Icone nome="etiqueta" tamanho={18} className="mr-2" /> Nova etiqueta</h1>
      <p className="mb-4 text-sm text-texto-suave">Olá, {colab.nome.split(" ")[0]} — escolha o item, confira e imprima.</p>
      <EtiquetaColabForm
        token={token}
        nome={colab.nome}
        itens={(its as ItemEtq[]) ?? []}
        categorias={(cats as CatEtq[]) ?? []}
        recentes={recentes}
        config={config}
      />
    </div>
  );
}
