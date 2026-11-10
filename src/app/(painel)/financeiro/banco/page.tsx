import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { buscarTodas } from "@/lib/supabase/todas";
import { dataBR } from "@/lib/format";
import { UploadOfx } from "./upload";
import { BancoTabela } from "./banco-tabela";

export const metadata = { title: "Conciliação bancária" };

const moeda = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const somarDiasISO = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const proximoMes = (mes: string) => {
  const [a, m] = mes.split("-").map(Number);
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`;
};

export default async function BancoPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const supabase = await createClient();
  const sp = await searchParams;

  // VELOCIDADE (DES-002): antes vinham o extrato inteiro (1,5 mil linhas) e
  // TODOS os lançamentos (3,9 mil) a cada clique, pra mostrar um mês só. Agora
  // vêm só as transações do mês escolhido e os lançamentos que podem casar com
  // elas (data do banco entre 8 meses antes e 4 depois — conferido: nenhuma sugestão dos últimos meses fica de fora). "Todos" ainda traz
  // tudo. Sempre em páginas de 1000 com ordem estável (o banco corta em 1000).
  const [{ data: datasData }, ligadosData] = await Promise.all([
    supabase.rpc("transacoes_meses"),
    // Lançamento já ligado a QUALQUER transação (de qualquer mês) não vira sugestão.
    buscarTodas<{ lancamento_id: string }>((de, ate) =>
      supabase.from("transacoes_banco").select("lancamento_id").not("lancamento_id", "is", null).order("id").range(de, ate),
    ),
  ]);
  const meses = ((datasData as { mes: string }[] | null) ?? []).map((r) => r.mes);
  const mesSel = sp.mes === "todos" ? "todos" : sp.mes && meses.includes(sp.mes) ? sp.mes : (meses[0] ?? "todos");
  const de = mesSel === "todos" ? null : `${mesSel}-01`;
  const ate = mesSel === "todos" ? null : `${proximoMes(mesSel)}-01`;
  const janDe = de ? somarDiasISO(de, -240) : null;
  const janAte = ate ? somarDiasISO(ate, 120) : null;

  const [transData, lancData, { data: catData }] =
    await Promise.all([
      buscarTodas((a, b) => {
        let q = supabase
          .from("transacoes_banco")
          .select("id, data, valor, descricao, banco, lancamento_id, lancamentos(descricao)");
        if (de && ate) q = q.gte("data", de).lt("data", ate);
        return q.order("data", { ascending: false }).order("id").range(a, b);
      }),
      buscarTodas((a, b) => {
        let q = supabase
          .from("lancamentos")
          .select("id, data, vencimento, pago_em, valor, descricao, nota_id, grupo_id, dre_categorias(tipo, nome), fornecedores(nome)");
        if (janDe && janAte) {
          q = q.or(
            `and(pago_em.gte.${janDe},pago_em.lt.${janAte}),and(pago_em.is.null,vencimento.gte.${janDe},vencimento.lt.${janAte}),and(pago_em.is.null,vencimento.is.null,data.gte.${janDe},data.lt.${janAte})`,
          );
        }
        return q.order("data", { ascending: false }).order("id").range(a, b);
      }),
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
    grupo_id: string | null;
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
  // O rótulo diz de QUE data estamos falando: "venc." quando a conta tem
  // vencimento e "pago" quando a baixa foi em outro dia. Antes escrevia
  // "venc." mostrando a data do pagamento — confundia na hora de conferir.
  const rotuloLanc = (l: Lanc) => {
    const nome = l.descricao ?? l.fornecedores?.nome ?? l.dre_categorias?.nome ?? "lançamento";
    let quando: string;
    if (l.vencimento) {
      quando = "venc. " + dataBR(l.vencimento);
      if (l.pago_em && l.pago_em !== l.vencimento) quando += " · pago " + dataBR(l.pago_em);
    } else if (l.pago_em) {
      quando = "pago " + dataBR(l.pago_em);
    } else {
      quando = dataBR(l.data);
    }
    return nome + " · " + quando + " · " + moeda(Number(l.valor));
  };

  // Um BOLETO pode ser mais de um lançamento: quando o banco cobra custas, a
  // nota vira "NF 544773" (221,31) + "custas do boleto" (1,80) e o banco debita
  // 223,11 de uma vez. Procurar lançamento a lançamento nunca acha esse valor —
  // então a sugestão trabalha com o boleto somado (mesma nota + mesmo vencimento).
  type Boleto = { ids: string[]; principal: Lanc; valor: number; quando: string; receita: boolean; partes: string };
  const grupos = new Map<string, Lanc[]>();
  for (const l of lancs) {
    // grupo_id = rateio feito na mão (fatura do cartão dividida em categorias);
    // nota_id + vencimento = boleto da nota (pode ter custas ou mais de uma categoria).
    const chave = l.grupo_id ?? (l.nota_id ? `${l.nota_id}|${l.vencimento ?? ""}` : l.id);
    const g = grupos.get(chave) ?? [];
    g.push(l);
    grupos.set(chave, g);
  }
  const boletos: Boleto[] = [...grupos.values()].map((g) => {
    const principal = g.reduce((a, b) => (Math.abs(Number(b.valor)) > Math.abs(Number(a.valor)) ? b : a));
    // Por que o boleto tem mais de um lançamento: o banco cobrou custas, OU a
    // nota foi dividida por categoria do DRE (laticínios + insumos, p.ex.).
    const nomes = g.map((l) =>
      /custas/i.test(l.descricao ?? "") ? "custas do boleto" : l.dre_categorias?.nome ?? "sem categoria",
    );
    return {
      ids: g.map((l) => l.id),
      principal,
      valor: Math.round(g.reduce((s, l) => s + Number(l.valor), 0) * 100) / 100,
      quando: dataBanco(principal),
      receita: principal.dre_categorias?.tipo === "receita",
      partes: g.length > 1 ? ` (${g.length} lançamentos: ${[...new Set(nomes)].join(" + ")})` : "",
    };
  });

  // Sugere um boleto para cada transação não conciliada (guloso, sem repetir).
  // Um boleto já conciliado em QUALQUER uma de suas partes está fora.
  const jaLigados = new Set(ligadosData.map((t) => t.lancamento_id));
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
      sugLabel.set(t.id, rotuloLanc(cand.principal).replace(moeda(Number(cand.principal.valor)), moeda(cand.valor)) + cand.partes);
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

  // Tela de conferir extrato: tabela densa, de leitura em coluna, e quanto
  // mais largura melhor. Em monitor grande ela parava em 896px e sobrava meia
  // tela vazia enquanto a descrição do banco quebrava em três linhas. Aqui não
  // tem teto: acompanha o monitor.
  return (
    <div className="w-full p-5">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-numero text-[28px] font-bold leading-[1.1] tracking-apertada text-texto">
            Conciliação bancária
          </h1>
          <p className="mt-1 text-texto-suave">
            Importe o extrato (OFX) de cada banco e case as transações com os
            lançamentos.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/financeiro"
            className="rounded-controle border border-orange-500 px-4 py-2 text-sm font-medium text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950"
          >
            Financeiro
          </Link>
          <UploadOfx />
        </div>
      </div>

      {meses.length === 0 ? (
        <div className="rounded-cartao bg-painel-cartao p-12 text-center text-texto-suave">
          Nenhuma transação ainda. Escolha o <b>banco</b> e clique em{" "}
          <b>Importar extrato (OFX)</b>.
        </div>
      ) : (
        <BancoTabela
          transacoes={rows}
          categorias={categorias}
          lancamentos={lancamentosOpt}
          meses={meses}
          mes={mesSel}
        />
      )}
    </div>
  );
}
