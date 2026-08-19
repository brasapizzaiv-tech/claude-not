import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { dataBR } from "@/lib/format";
import { UploadOfx } from "./upload";
import { BancoTabela } from "./banco-tabela";

const moeda = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default async function BancoPage() {
  const supabase = await createClient();

  const [{ data: transData }, { data: lancData }, { data: catData }] =
    await Promise.all([
      supabase
        .from("transacoes_banco")
        .select("id, data, valor, descricao, banco, lancamento_id, lancamentos(descricao)")
        .order("data", { ascending: false })
        .limit(1000),
      supabase
        .from("lancamentos")
        .select("id, data, valor, descricao, dre_categorias(tipo, nome), fornecedores(nome)")
        .order("data", { ascending: false })
        .limit(2000),
      supabase
        .from("dre_categorias")
        .select("id, nome, tipo, grupo")
        .eq("ativo", true)
        .order("grupo")
        .order("ordem"),
    ]);

  type Trans = {
    id: string;
    data: string;
    valor: number;
    descricao: string | null;
    banco: string | null;
    lancamento_id: string | null;
    lancamentos: { descricao?: string } | null;
  };
  type Lanc = {
    id: string;
    data: string;
    valor: number;
    descricao: string | null;
    dre_categorias: { tipo?: string; nome?: string } | null;
    fornecedores: { nome?: string } | null;
  };
  const transacoes = (transData as unknown as Trans[]) ?? [];
  const lancs = (lancData as unknown as Lanc[]) ?? [];
  const categorias =
    (catData as { id: string; nome: string; tipo: string; grupo: string }[]) ?? [];

  const rotuloLanc = (l: Lanc) =>
    `${l.descricao ?? l.fornecedores?.nome ?? l.dre_categorias?.nome ?? "lançamento"} · ${dataBR(l.data)} · ${moeda(Number(l.valor))}`;

  // Sugere um lançamento para cada transação não conciliada (guloso, sem repetir).
  const usados = new Set(
    transacoes.filter((t) => t.lancamento_id).map((t) => t.lancamento_id),
  );
  const diasEntre = (a: string, b: string) =>
    Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 864e5);
  const sugId = new Map<string, string>();
  const sugLabel = new Map<string, string>();
  for (const t of transacoes) {
    if (t.lancamento_id) continue;
    const querReceita = Number(t.valor) > 0;
    const alvo = Math.abs(Number(t.valor));
    const cand = lancs
      .filter(
        (l) =>
          !usados.has(l.id) &&
          Math.abs(Number(l.valor) - alvo) < 0.005 &&
          (l.dre_categorias?.tipo === "receita") === querReceita,
      )
      .sort((a, b) => diasEntre(a.data, t.data) - diasEntre(b.data, t.data))[0];
    if (cand) {
      sugId.set(t.id, cand.id);
      usados.add(cand.id);
      sugLabel.set(t.id, rotuloLanc(cand));
    }
  }

  const rows = transacoes.map((t) => ({
    id: t.id,
    data: t.data,
    valor: Number(t.valor),
    descricao: t.descricao,
    banco: t.banco,
    lancamento_id: t.lancamento_id,
    lancamentoLabel: t.lancamentos?.descricao ?? null,
    sugestaoId: sugId.get(t.id) ?? null,
    sugestaoLabel: sugLabel.get(t.id) ?? null,
  }));

  const lancamentosOpt = lancs.map((l) => ({
    id: l.id,
    label: rotuloLanc(l),
    tipo: l.dre_categorias?.tipo ?? "",
  }));

  return (
    <div className="mx-auto max-w-4xl p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            Conciliação bancária
          </h1>
          <p className="mt-1 text-zinc-500">
            Importe o extrato (OFX) de cada banco e case as transações com os
            lançamentos.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/financeiro"
            className="rounded-lg border border-orange-500 px-4 py-2 text-sm font-medium text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950"
          >
            Financeiro
          </Link>
          <UploadOfx />
        </div>
      </div>

      {transacoes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 p-12 text-center text-zinc-500 dark:border-zinc-700">
          Nenhuma transação ainda. Escolha o <b>banco</b> e clique em{" "}
          <b>Importar extrato (OFX)</b>.
        </div>
      ) : (
        <BancoTabela
          transacoes={rows}
          categorias={categorias}
          lancamentos={lancamentosOpt}
        />
      )}
    </div>
  );
}
