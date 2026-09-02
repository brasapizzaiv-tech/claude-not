import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { EtiquetaConfig } from "@/lib/etiqueta-tipos";
import { EtiquetaImpressao } from "./impressao";

export default async function EtiquetaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("etiquetas")
    .select("id, numero, produto_nome, colaborador_nome, manipulado_em, validade, conservacao, quantidade, unidade, tipo, categoria_nome, marca, lote, validade_original, sif, texto, impressora_id")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();

  let config: EtiquetaConfig | null = null;
  if (data.impressora_id) {
    const { data: imp } = await supabase.from("impressoras").select("etiqueta_config").eq("id", data.impressora_id).maybeSingle();
    config = (imp?.etiqueta_config as EtiquetaConfig | null) ?? null;
  }

  return (
    <div className="mx-auto max-w-2xl p-8">
      <Link
        href="/etiquetas"
        className="text-sm text-zinc-500 hover:text-orange-600 print:hidden"
      >
        ← Voltar para etiquetas
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-bold text-zinc-900 dark:text-zinc-50 print:hidden">
        Etiqueta #{data.numero}
      </h1>
      <EtiquetaImpressao
        d={{
          id: data.id as string,
          numero: data.numero as number,
          produto: data.produto_nome as string,
          colaborador: (data.colaborador_nome as string) ?? null,
          manipuladoEm: data.manipulado_em as string,
          validade: (data.validade as string) ?? null,
          conservacao: (data.conservacao as string) ?? null,
          quantidade: (data.quantidade as number) ?? null,
          unidade: (data.unidade as string) ?? null,
          tipo: (data.tipo as string) ?? null,
          categoria: (data.categoria_nome as string) ?? null,
          marca: (data.marca as string) ?? null,
          lote: (data.lote as string) ?? null,
          validadeOriginal: (data.validade_original as string) ?? null,
          sif: (data.sif as string) ?? null,
          texto: (data.texto as string) ?? null,
        }}
        config={config}
      />
    </div>
  );
}
