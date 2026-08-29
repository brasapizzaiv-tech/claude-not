import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EstacaoClient } from "../estacao-client";

export const metadata = { title: "Estação de impressão · Brasa" };

export default async function EstacaoImpressoraPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("impressoras").select("id, nome").eq("id", id).maybeSingle();
  if (!data) notFound();
  return <EstacaoClient impressoraId={data.id as string} nome={data.nome as string} />;
}
