import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ItemEtq, CatEtq } from "@/components/etiqueta-ui";
import { EtiquetaColabForm } from "./form";

export const metadata = { title: "Nova etiqueta · Brasa" };

export default async function NovaEtiquetaColabPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();
  const { data: colab } = await admin
    .from("colaboradores")
    .select("nome, ativo, faz_etiquetas")
    .eq("token", token)
    .maybeSingle();

  if (!colab || !colab.ativo || !colab.faz_etiquetas) {
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <p className="text-zinc-500">Você não tem acesso a etiquetas.</p>
        <Link href={`/eu/${token}`} className="mt-3 inline-block text-sm text-orange-600">← Voltar</Link>
      </div>
    );
  }

  const [{ data: its }, { data: cats }, { data: recs }] = await Promise.all([
    admin
      .from("etiqueta_itens")
      .select("id, nome, categoria_id, validade_congelado, validade_resfriado, validade_ambiente")
      .eq("ativo", true)
      .order("nome"),
    admin.from("etiqueta_categorias").select("id, nome").eq("ativo", true).order("ordem").order("nome"),
    admin.from("etiquetas").select("item_id").not("item_id", "is", null).order("criado_em", { ascending: false }).limit(80),
  ]);
  const recentes = [...new Set(((recs as { item_id: string }[]) ?? []).map((r) => r.item_id))];

  return (
    <div className="mx-auto min-h-screen max-w-md bg-zinc-50 p-4 dark:bg-zinc-950">
      <Link href={`/eu/${token}`} className="text-sm text-zinc-500">← Voltar</Link>
      <h1 className="mt-2 mb-1 text-xl font-bold text-zinc-900 dark:text-zinc-50">🏷️ Nova etiqueta</h1>
      <p className="mb-4 text-sm text-zinc-500">Olá, {colab.nome.split(" ")[0]} — escolha o item, confira e imprima.</p>
      <EtiquetaColabForm
        token={token}
        nome={colab.nome}
        itens={(its as ItemEtq[]) ?? []}
        categorias={(cats as CatEtq[]) ?? []}
        recentes={recentes}
      />
    </div>
  );
}
