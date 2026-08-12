"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { lerRelatorioNotas } from "@/lib/notas-emitidas";

export async function importarNotasEmitidas(html: string) {
  const supabase = await createClient();
  const notas = lerRelatorioNotas(html);
  if (notas.length === 0)
    return { ok: false, erro: "Nenhuma nota encontrada no arquivo." };

  let novas = 0;
  for (let i = 0; i < notas.length; i += 500) {
    const lote = notas.slice(i, i + 500).map((n) => ({
      chave: n.chave,
      numero: n.numero,
      serie: n.serie,
      modelo: n.modelo,
      status: n.status,
      valor: n.valor,
      data_emissao: n.data_emissao,
      consumidor: n.consumidor,
    }));
    const { data } = await supabase
      .from("notas_emitidas")
      .upsert(lote, { onConflict: "chave", ignoreDuplicates: true })
      .select("id");
    novas += data?.length ?? 0;
  }

  revalidatePath("/financeiro/vendas");
  return { ok: true, total: notas.length, novas };
}
