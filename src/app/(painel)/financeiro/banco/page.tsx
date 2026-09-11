import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { dataBR } from "@/lib/format";
import { UploadOfx } from "./upload";
import { BancoTabela } from "./banco-tabela";

const moeda = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// O PostgREST devolve no máximo 1000 linhas por requisição — com quase 3000
// lançamentos, os mais antigos nunca chegavam aqui e nunca viravam sugestão.
// Busca em páginas até acabar.
async function lancamentosTodos(supabase: Awaited<ReturnType<typeof createClient>>) {
  const tudo: unknown[] = [];
  for (let de = 0; de < 20000; de += 1000) {
    const { data } = await supabase
      .from("lancamentos")
      .select("id, data, vencimento, pago_em, valor, descricao, nota_id, dre_categorias(tipo, nome), fornecedores(nome)")
      .order("data", { ascending: false })
      .range(de, de + 999);
    const pagina = (data as unknown[]) ?? [];
    tudo.push(...pagina);
    if (pagina.length < 1000) break;
  }
  return { data: tudo };
}

export default async function BancoPage() {
  const supabase = await createClient();

  const [{ data: transData }, { data: lancData }, { data: catData }] =
    await Promise.all([
      supabase
        .from("transacoes_banco")
        .select("id, data, valor, descricao, banco, lancamento_id, lancamentos(descricao)")
        .order("data", { ascending: false })
        // O extrato cresce ~400 linhas/mês; com 1000 as mais antigas sumiam da
        // tela (e da conciliação) sem aviso.
        .limit(5000),
      lancamentosTodos(supabase),
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
    vencimento: string | null;
    pago_em: string | null;
    valor: number;
    descricao: string | null;
    nota_id: string | null;
    dre_categorias: { tipo?: string; nome?: string } | null;
    fornecedores: { nome?: string } | null;
  };
  const transacoes = (transData as unknown as Trans[]) ?? [];
  const lancs = (lancData as unknown as Lanc[]) ?? [];
  const categorias =
    (catData as { id: string; nome: string; tipo: string; grupo: string }[]) ?? [];

  // Data que o banco vê: quando pagou, senão o vencimento, senão a competência.
  // (A "data" do lançamento é a da nota — 01/08 numa nota que venceu 31/08 —
  // e mostrar ela aqui fazia a sugestão parecer errada.)
  const dataBanco = (l: Lanc) => l.pago_em ?? l.vencimento ?? l.data;
  const rotuloLanc = (l: Lanc) =>
    `${l.descricao ?? l.fornecedores?.nome ?? l.dre_categorias?.nome ?? "lançamento"} · ${l.vencimento ? "venc. " : ""}${dataBR(dataBanco(l))} · ${moeda(Number(l.valor))}`;

  // Um BOLETO pode ser mais de um lançamento: quando o banco cobra custas, a
  // nota vira "NF 544773" (221,31) + "custas do boleto" (1,80) e o banco debita
  // 223,11 de uma vez. Procurar lançamento a lançamento nunca acha esse valor —
  // então a sugestão trabalha com o boleto somado (mesma nota + mesmo vencimento).
  type Boleto = { ids: string[]; principal: Lanc; valor: number; quando: string; receita: boolean };
  const grupos = new Map<string, Lanc[]>();
  for (const l of lancs) {
    const chave = l.nota_id ? `${l.nota_id}|${l.vencimento ?? ""}` : l.id;
    const g = grupos.get(chave) ?? [];
    g.push(l);
    grupos.set(chave, g);
  }
  const boletos: Boleto[] = [...grupos.values()].map((g) => {
    const principal = g.reduce((a, b) => (Math.abs(Number(b.valor)) > Math.abs(Number(a.valor)) ? b : a));
    return {
      ids: g.map((l) => l.id),
      principal,
      valor: Math.round(g.reduce((s, l) => s + Number(l.valor), 0) * 100) / 100,
      quando: dataBanco(principal),
      receita: principal.dre_categorias?.tipo === "receita",
    };
  });

  // Sugere um boleto para cada transação não conciliada (guloso, sem repetir).
  // Um boleto já conciliado em QUALQUER uma de suas partes está fora.
  const jaLigados = new Set(transacoes.filter((t) => t.lancamento_id).map((t) => t.lancamento_id));
  const usados = new Set<string>();
  for (const b of boletos) if (b.ids.some((id) => jaLigados.has(id))) b.ids.forEach((id) => usados.add(id));
  const diasEntre = (a: string, b: string) =>
    Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 864e5);
  const sugId = new Map<string, string>();
  const sugLabel = new Map<string, string>();
  // Distância em dias entre a conta e o que saiu do banco. Fornecedor de valor
  // fixo (Ecad, Petry, aluguel) casa com qualquer mês: acima de 10 dias a
  // sugestão é FRACA — aparece em amarelo e fica fora do "conciliar todas".
  const sugDias = new Map<string, number>();
  for (const t of transacoes) {
    if (t.lancamento_id) continue;
    const querReceita = Number(t.valor) > 0;
    const alvo = Math.abs(Number(t.valor));
    const cand = boletos
      .filter(
        (b) =>
          !b.ids.some((id) => usados.has(id)) &&
          Math.abs(b.valor - alvo) < 0.005 &&
          b.receita === querReceita,
      )
      .sort((a, b) => diasEntre(a.quando, t.data) - diasEntre(b.quando, t.data))[0];
    if (cand) {
      // A transação fica ligada ao lançamento principal; as partes do mesmo
      // boleto (custas) saem da lista pra não virarem sugestão de outra coisa.
      sugId.set(t.id, cand.principal.id);
      cand.ids.forEach((id) => usados.add(id));
      const partes = cand.ids.length > 1 ? ` (+ custas, ${cand.ids.length} lançamentos)` : "";
      sugLabel.set(t.id, rotuloLanc(cand.principal).replace(moeda(Number(cand.principal.valor)), moeda(cand.valor)) + partes);
      sugDias.set(t.id, Math.round(diasEntre(cand.quando, t.data)));
    }
  }

  // Casa transações de saída sem par com notas PENDENTES (por valor) → oferece lançar a nota.
  const { data: notasPend } = await supabase
    .from("notas_fiscais")
    .select("id, numero, emit_nome, valor")
    .eq("situacao", "pendente")
    .limit(500);
  const notasP =
    (notasPend as { id: string; numero: string | null; emit_nome: string | null; valor: number }[]) ?? [];
  const notasUsadas = new Set<string>();
  const notaMatchId = new Map<string, string>();
  const notaMatchLabel = new Map<string, string>();
  for (const t of transacoes) {
    if (t.lancamento_id || Number(t.valor) >= 0 || sugId.has(t.id)) continue;
    const alvo = Math.abs(Number(t.valor));
    const cand = notasP.find(
      (n) => !notasUsadas.has(n.id) && Math.abs(Number(n.valor) - alvo) < 0.01,
    );
    if (cand) {
      notasUsadas.add(cand.id);
      notaMatchId.set(t.id, cand.id);
      notaMatchLabel.set(t.id, `NF ${cand.numero ?? "—"} — ${cand.emit_nome ?? "fornecedor"}`);
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
    sugestaoDias: sugDias.get(t.id) ?? null,
    notaSugeridaId: notaMatchId.get(t.id) ?? null,
    notaSugeridaLabel: notaMatchLabel.get(t.id) ?? null,
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
