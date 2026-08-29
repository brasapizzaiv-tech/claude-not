import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { EtiquetaColabForm, type ProdEtq } from "./form";

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

  const { data: prods } = await admin
    .from("produtos")
    .select("id, nome, validade_congelado, validade_resfriado, validade_ambiente")
    .eq("ativo", true)
    .order("nome");

  return (
    <div className="mx-auto min-h-screen max-w-md bg-zinc-50 p-4 dark:bg-zinc-950">
      <Link href={`/eu/${token}`} className="text-sm text-zinc-500">← Voltar</Link>
      <h1 className="mt-2 mb-1 text-xl font-bold text-zinc-900 dark:text-zinc-50">🏷️ Nova etiqueta</h1>
      <p className="mb-4 text-sm text-zinc-500">Olá, {colab.nome.split(" ")[0]} — a etiqueta sai na impressora ao gerar.</p>
      <EtiquetaColabForm token={token} produtos={(prods as ProdEtq[]) ?? []} />
    </div>
  );
}
