"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirAcesso } from "@/lib/permissoes-server";
import { lerFaturaTexto, chaveEstabelecimento, type CompraFatura } from "@/lib/fatura";

export type CompraRevisada = CompraFatura & {
  uid: string;
  categoriaId: string | null;
  sugerida: boolean; // a categoria veio de uma regra aprendida
};

// Lê o arquivo da fatura (PDF ou texto/CSV) e devolve as compras já com a
// categoria que o sistema aprendeu das faturas anteriores.
export async function lerFatura(formData: FormData) {
  await exigirAcesso("/financeiro");
  const arquivo = formData.get("arquivo") as File | null;
  if (!arquivo || arquivo.size === 0) return { ok: false as const, erro: "Escolha o arquivo da fatura." };
  if (arquivo.size > 15 * 1024 * 1024) return { ok: false as const, erro: "Arquivo muito grande (máx. 15 MB)." };

  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  let texto = "";
  const ehPdf = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // %PDF
  if (ehPdf) {
    try {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(bytes);
      const r = await extractText(pdf, { mergePages: true });
      texto = Array.isArray(r.text) ? r.text.join("\n") : String(r.text ?? "");
    } catch (e) {
      return { ok: false as const, erro: "Não consegui ler este PDF: " + (e instanceof Error ? e.message : "erro") };
    }
  } else {
    texto = new TextDecoder("utf-8").decode(bytes);
    // Fatura em CSV/TXT às vezes vem em Latin-1 (acentos viram "�").
    if (texto.includes("�")) texto = new TextDecoder("latin1").decode(bytes);
  }

  const lida = lerFaturaTexto(texto);
  if (lida.compras.length === 0) {
    return {
      ok: false as const,
      erro: "Não achei compras nesse arquivo. Se a fatura for uma imagem escaneada, o texto não pode ser lido — baixe a versão em PDF ou CSV pelo aplicativo do banco.",
    };
  }

  // Categorias aprendidas das faturas anteriores.
  const supabase = await createClient();
  const { data: regras } = await supabase.from("fatura_regras").select("padrao, categoria_id");
  const mapa = new Map(
    ((regras as { padrao: string; categoria_id: string | null }[]) ?? []).map((r) => [r.padrao, r.categoria_id]),
  );

  const compras: CompraRevisada[] = lida.compras.map((c) => {
    const cat = mapa.get(chaveEstabelecimento(c.descricao)) ?? null;
    return { ...c, uid: randomUUID(), categoriaId: cat, sugerida: !!cat };
  });

  return { ok: true as const, ...lida, compras };
}

// Cria UM lançamento por compra, todos amarrados pelo mesmo grupo (a fatura),
// e aprende a categoria de cada estabelecimento pra próxima vez.
export async function lancarFatura(input: {
  compras: { descricao: string; valor: number; categoriaId: string; data: string | null; parcela: string | null }[];
  competencia: string;   // AAAA-MM
  vencimento: string;    // AAAA-MM-DD
  banco: string | null;
  pago: boolean;
  transacaoId?: string | null; // débito da fatura no extrato, pra conciliar junto
}) {
  await exigirAcesso("/financeiro");
  const supabase = await createClient();

  const linhas = (input.compras ?? []).filter((c) => c.categoriaId && Number.isFinite(c.valor) && c.valor !== 0);
  if (linhas.length === 0) return { ok: false as const, erro: "Nenhuma compra com categoria." };
  if (!/^\d{4}-\d{2}$/.test(input.competencia)) return { ok: false as const, erro: "Competência inválida." };

  const grupo = randomUUID();
  const dataComp = `${input.competencia}-01`;
  const venc = /^\d{4}-\d{2}-\d{2}$/.test(input.vencimento) ? input.vencimento : null;

  const { data: criados, error } = await supabase
    .from("lancamentos")
    .insert(
      linhas.map((c) => ({
        data: dataComp,
        categoria_id: c.categoriaId,
        valor: Math.round(Math.abs(c.valor) * 100) / 100,
        descricao: `${c.descricao}${c.parcela ? ` (${c.parcela})` : ""}`,
        origem: "manual",
        banco: input.banco,
        forma_pagamento: "Cartão de crédito",
        vencimento: venc,
        compra_em: c.data,
        emissao: c.data,
        pago: input.pago,
        pago_em: input.pago ? venc : null,
        grupo_id: grupo,
      })),
    )
    .select("id, valor");
  if (error) return { ok: false as const, erro: error.message };

  const criadas = (criados as { id: string; valor: number }[]) ?? [];
  // A fatura no extrato aponta pro maior lançamento; o grupo sai das sugestões.
  if (input.transacaoId && criadas.length > 0) {
    const principal = criadas.reduce((a, b) => (Number(b.valor) > Number(a.valor) ? b : a));
    await supabase.from("transacoes_banco").update({ lancamento_id: principal.id }).eq("id", input.transacaoId);
  }

  // Aprende: da próxima vez, esse estabelecimento já vem classificado.
  for (const c of linhas) {
    const padrao = chaveEstabelecimento(c.descricao);
    if (!padrao) continue;
    const { data: ja } = await supabase.from("fatura_regras").select("id, usos").eq("padrao", padrao).maybeSingle();
    if (ja) {
      await supabase
        .from("fatura_regras")
        .update({ categoria_id: c.categoriaId, usos: (ja as { usos: number }).usos + 1, usado_em: new Date().toISOString() })
        .eq("id", (ja as { id: string }).id);
    } else {
      await supabase.from("fatura_regras").insert({ padrao, categoria_id: c.categoriaId });
    }
  }

  revalidatePath("/financeiro");
  revalidatePath("/financeiro/contas");
  revalidatePath("/financeiro/banco");
  return { ok: true as const, total: criadas.length };
}
