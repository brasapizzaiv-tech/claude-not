"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirAcesso } from "@/lib/permissoes-server";
import { emitirNfceComandas, imprimirNfce } from "../fiscal-actions";

const soDoc = (s: string) => (s || "").replace(/\D/g, "");

// Guarda o CPF/CNPJ enquanto a nota ainda está esperando (o cliente pediu).
export async function salvarCpfPendente(id: string, documento: string) {
  await exigirAcesso("/salao");
  const doc = soDoc(documento);
  if (doc && doc.length !== 11 && doc.length !== 14) {
    return { ok: false as const, mensagem: "CPF tem 11 números e CNPJ tem 14." };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("nfce_pendentes")
    .update({ cpf_cnpj: doc || null })
    .eq("id", id)
    .eq("status", "aguardando");
  if (error) return { ok: false as const, mensagem: error.message };
  revalidatePath("/salao/caixa");
  return { ok: true as const };
}

// Emite na hora (o cliente já quer a nota) e manda pra impressora.
export async function emitirNotaPendenteAgora(id: string, documento?: string) {
  await exigirAcesso("/salao");
  const supabase = await createClient();
  const doc = soDoc(documento ?? "");
  if (doc && doc.length !== 11 && doc.length !== 14) {
    return { ok: false as const, mensagem: "CPF tem 11 números e CNPJ tem 14." };
  }

  // Só emite quem conseguir tirar a linha de "aguardando" — evita duas notas
  // se a rotina automática pegar a mesma conta no mesmo instante.
  const { data: presas } = await supabase
    .from("nfce_pendentes")
    .update({ status: "emitindo", cpf_cnpj: doc || null })
    .eq("id", id)
    .in("status", ["aguardando", "erro"])
    .select("id, comanda_ids, cpf_cnpj");
  const linha = ((presas as { id: string; comanda_ids: string[]; cpf_cnpj: string | null }[]) ?? [])[0];
  if (!linha) return { ok: false as const, mensagem: "Esta nota já está sendo emitida." };

  const r = await emitirNfceComandas(linha.comanda_ids, linha.cpf_cnpj ?? "");
  if (!r.ok) {
    await supabase
      .from("nfce_pendentes")
      .update({ status: "erro", erro: r.mensagem ?? "não autorizou", resolvido_em: new Date().toISOString() })
      .eq("id", id);
    revalidatePath("/salao/caixa");
    return { ok: false as const, mensagem: r.mensagem ?? "não autorizou" };
  }

  const nfceId = "id" in r ? (r.id as string | undefined) : undefined;
  await supabase
    .from("nfce_pendentes")
    .update({ status: "emitida", nfce_id: nfceId ?? null, erro: null, resolvido_em: new Date().toISOString() })
    .eq("id", id);
  if (nfceId) await imprimirNfce(nfceId);
  revalidatePath("/salao/caixa");
  return { ok: true as const, numero: r.numero };
}

// O cliente não quer nota: tira da fila.
export async function cancelarNotaPendente(id: string) {
  await exigirAcesso("/salao");
  const supabase = await createClient();
  const { error } = await supabase
    .from("nfce_pendentes")
    .update({ status: "cancelada", resolvido_em: new Date().toISOString() })
    .eq("id", id)
    .in("status", ["aguardando", "erro"]);
  if (error) return { ok: false as const, mensagem: error.message };
  revalidatePath("/salao/caixa");
  return { ok: true as const };
}
