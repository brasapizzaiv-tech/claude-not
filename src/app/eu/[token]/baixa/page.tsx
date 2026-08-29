import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { BaixaScanner } from "./scanner";

export const metadata = { title: "Dar baixa · Brasa" };

export default async function BaixaColabPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();
  const { data: colab } = await admin
    .from("colaboradores")
    .select("ativo, faz_etiquetas")
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

  return <BaixaScanner token={token} />;
}
