import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { buscarTodas } from "@/lib/supabase/todas";
import { hojeSP } from "@/lib/etiqueta-vencimentos";
import { ConsumoTabela, type LinhaConsumo } from "./consumo-tabela";

// Consumo dos produtos (migration 0244): entre duas contagens seguidas,
// consumo = tinha + chegou − tem agora. Média das últimas 8 semanas e as
// últimas 12 semanas uma a uma, pra ver se o produto está saindo mais ou menos.
export const metadata = { title: "Consumo do estoque · Brasa" };
export const dynamic = "force-dynamic";

const SEMANAS = 12;
const somaDias = (dia: string, n: number) => new Date(new Date(`${dia}T12:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
// Segunda-feira da semana de uma data (AAAA-MM-DD).
function segunda(dia: string) {
  const d = new Date(`${dia}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  return somaDias(dia, -dow);
}

type Periodo = { produto_id: string; ini: string; fim: string; qtd_fim: number; consumo: number; dias: number };

export default async function ConsumoPage() {
  const supabase = await createClient();
  const hoje = hojeSP();
  const inicioSemanas = segunda(somaDias(hoje, -7 * (SEMANAS - 1)));

  const [periodos, { data: prods }] = await Promise.all([
    // Pode passar de 1000 intervalos: em páginas.
    buscarTodas<Periodo>((de, ate) =>
      supabase.rpc("consumo_periodos", { p_desde: inicioSemanas }).order("produto_id").order("fim").range(de, ate),
    ),
    supabase.from("produtos").select("id, nome, unidade, categorias(nome)").eq("ativo", true),
  ]);

  const semanas = Array.from({ length: SEMANAS }, (_, i) => somaDias(inicioSemanas, 7 * i));
  const desde8 = somaDias(hoje, -56);
  const porProduto = new Map<string, Periodo[]>();
  for (const p of periodos) {
    const l = porProduto.get(p.produto_id) ?? [];
    l.push({ ...p, qtd_fim: Number(p.qtd_fim), consumo: Number(p.consumo), dias: Number(p.dias) });
    porProduto.set(p.produto_id, l);
  }

  const linhas: LinhaConsumo[] = [];
  for (const pr of (prods as unknown as { id: string; nome: string; unidade: string; categorias: { nome: string } | { nome: string }[] | null }[]) ?? []) {
    const ps = porProduto.get(pr.id);
    if (!ps || ps.length === 0) continue;
    // Contagem errada (consumo negativo) fica fora — igual à média da contagem.
    const validos = ps.filter((p) => p.consumo >= 0);
    const ult8 = validos.filter((p) => p.fim.slice(0, 10) >= desde8);
    const dias8 = ult8.reduce((s, p) => s + p.dias, 0);
    const media = dias8 >= 3 ? (ult8.reduce((s, p) => s + p.consumo, 0) / dias8) * 7 : null;
    // Semana a semana (pela data da contagem que fecha o intervalo).
    const valores = semanas.map((seg) => {
      const fimSem = somaDias(seg, 7);
      const da = validos.filter((p) => p.fim.slice(0, 10) >= seg && p.fim.slice(0, 10) < fimSem);
      const d = da.reduce((s, p) => s + p.dias, 0);
      return d > 0 ? (da.reduce((s, p) => s + p.consumo, 0) / d) * 7 : null;
    });
    const ultimo = ps[ps.length - 1];
    const cat = Array.isArray(pr.categorias) ? pr.categorias[0] : pr.categorias;
    linhas.push({
      id: pr.id,
      nome: pr.nome,
      unidade: pr.unidade,
      categoria: cat?.nome ?? "Sem categoria",
      media,
      semanas: valores,
      estoque: ultimo.qtd_fim,
      contadoEm: ultimo.fim.slice(0, 10),
      erradas: ps.length - validos.length,
    });
  }
  linhas.sort((a, b) => (b.media ?? -1) - (a.media ?? -1));

  return (
    <div className="w-full p-4 md:p-8">
      <Link href="/contagens" className="text-sm font-semibold text-texto-marca hover:underline">← Contagem de estoque</Link>
      <h1 className="mt-2 font-numero text-[28px] font-bold leading-[1.1] tracking-apertada text-texto">Consumo do estoque</h1>
      <p className="mt-1 max-w-3xl text-sm text-texto-suave">
        Quanto sai de cada produto por semana, pelas contagens: <b className="text-texto">tinha + chegou − tem agora</b>.
        A média é das últimas 8 semanas; o gráfico mostra as últimas {SEMANAS}. Contagem que deu consumo negativo
        (contou errado) fica fora da conta.
      </p>
      <ConsumoTabela linhas={linhas} semanas={semanas} />
    </div>
  );
}
