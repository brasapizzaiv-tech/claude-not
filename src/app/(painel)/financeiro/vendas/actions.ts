"use server";

import { revalidatePath } from "next/cache";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";
import { lerRelatorioNotas } from "@/lib/notas-emitidas";

// Importa o FATURAMENTO da planilha de custo (abas por mês, blocos ALMOÇO e
// NOITE). Só interessa a coluna REALIZADO de cada bloco (3 colunas depois de
// "DATA"). Reimportar substitui os lançamentos 'planilha' das mesmas datas.
export async function importarFaturamentoPlanilha(fd: FormData) {
  const supabase = await createClient();
  const file = fd.get("arquivo") as File | null;
  if (!file || file.size === 0) return { ok: false as const, erro: "Escolha o arquivo." };
  if (file.size > 10 * 1024 * 1024) return { ok: false as const, erro: "Arquivo muito grande." };

  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: "buffer" });
  } catch {
    return { ok: false as const, erro: "Não consegui ler a planilha. É um .xlsx válido?" };
  }

  const num = (v: unknown) => (typeof v === "number" && isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null);
  const dias: { data: string; almoco: number | null; noite: number | null }[] = [];

  for (const nome of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(wb.Sheets[nome], { header: 1, raw: true });
    const hIdx = rows.findIndex((r) => String(r?.[0] ?? "").trim().toUpperCase() === "DATA");
    if (hIdx < 0) continue;
    const header = rows[hIdx];
    const colsData = header
      .map((v, i) => (String(v ?? "").trim().toUpperCase() === "DATA" ? i : -1))
      .filter((i) => i >= 0);
    const cAlm = colsData[0];
    const cNoi = colsData.length > 1 ? colsData[1] : null;
    for (const r of rows.slice(hIdx + 1)) {
      const serial = r?.[cAlm];
      // Linha de dia = número serial do Excel na coluna DATA. TOTAL/rodapé caem fora.
      if (typeof serial !== "number" || serial < 20000 || serial > 80000) continue;
      const dataISO = new Date(Math.round((serial - 25569) * 86400000)).toISOString().slice(0, 10);
      dias.push({
        data: dataISO,
        almoco: num(r[cAlm + 3]),
        noite: cNoi != null ? num(r[cNoi + 3]) : null,
      });
    }
  }

  const comValor = dias.filter((d) => d.almoco != null || d.noite != null);
  if (comValor.length === 0) {
    return { ok: false as const, erro: "Não achei valores de faturamento (coluna REALIZADO) na planilha." };
  }

  // Grava na tabela PRÓPRIA da comparação (não mexe no Financeiro/DRE).
  // Reimportar a mesma data substitui o valor (upsert).
  const linhas = comValor.map((d) => ({
    data: d.data,
    almoco: d.almoco,
    noite: d.noite,
    atualizado_em: new Date().toISOString(),
  }));
  for (let i = 0; i < linhas.length; i += 500) {
    const { error } = await supabase.from("faturamento_dias").upsert(linhas.slice(i, i + 500), { onConflict: "data" });
    if (error) return { ok: false as const, erro: `Falha ao gravar: ${error.message}` };
  }

  const total = Math.round(comValor.reduce((s, d) => s + (d.almoco ?? 0) + (d.noite ?? 0), 0) * 100) / 100;
  revalidatePath("/financeiro/vendas");
  return { ok: true as const, dias: comValor.length, total };
}

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
