import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { NotasClient, type NotaLinha } from "./notas-client";

export default async function NotasFiscaisPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("nfce_emitidas")
    .select("id, modelo, ambiente, status, numero, serie, chave, url_danfe, url_xml, valor, mensagem, criado_em, pdv_comandas(numero)")
    .order("criado_em", { ascending: false })
    .limit(1000);

  const linhas: NotaLinha[] = ((data as unknown as Record<string, unknown>[]) ?? []).map((r) => ({
    id: r.id as string,
    modelo: (r.modelo as string) || "nfce",
    ambiente: (r.ambiente as string) || "",
    status: (r.status as string) || "",
    numero: (r.numero as string) || null,
    serie: (r.serie as string) || null,
    chave: (r.chave as string) || null,
    urlDanfe: (r.url_danfe as string) || null,
    urlXml: (r.url_xml as string) || null,
    valor: r.valor != null ? Number(r.valor) : null,
    mensagem: (r.mensagem as string) || null,
    criadoEm: (r.criado_em as string) || null,
    comandaNumero: (r.pdv_comandas as { numero?: number } | null)?.numero ?? null,
  }));

  const autorizadas = linhas.filter((l) => l.status === "autorizado");
  const canceladas = linhas.filter((l) => l.status === "cancelado");
  const erros = linhas.filter((l) => l.status !== "autorizado" && l.status !== "cancelado");
  const valorTotal = autorizadas.reduce((s, l) => s + (l.valor ?? 0), 0);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <Link href="/salao" className="text-sm text-zinc-500 hover:text-orange-600">← Salão</Link>
      <h1 className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-50">Notas fiscais</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Notas geradas pelo sistema (NFC-e/NF-e). Ambiente atual das últimas emissões destacado nos cartões.
      </p>

      <NotasClient
        linhas={linhas}
        stats={{
          emitidas: autorizadas.length,
          valorTotal,
          canceladas: canceladas.length,
          erro: erros.length,
        }}
      />
    </div>
  );
}
