import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { exigirAcesso } from "@/lib/permissoes-server";
import { buscarTodas } from "@/lib/supabase/todas";
import { categoriasDeSangria } from "@/lib/sangria-financeiro";
import { SangriasClient, type LinhaSangria } from "./sangrias-client";

export const metadata = { title: "Sangrias · Caixa" };
export const dynamic = "force-dynamic";

const diaSP = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const meioDia = (d: string) => new Date(`${d}T12:00:00-03:00`).getTime();

// Sangrias do caixa e o que virou despesa no financeiro (migration 0252).
export default async function SangriasPage({ searchParams }: { searchParams: Promise<{ de?: string }> }) {
  await exigirAcesso(["/salao", "/financeiro"]);
  const { de: deParam } = await searchParams;
  const de = /^\d{4}-\d{2}-\d{2}$/.test(deParam ?? "") ? (deParam as string) : "2026-09-01";
  const db = await createClient();
  const [movs, categorias, parecidos] = await Promise.all([
    buscarTodas<{ id: string; descricao: string | null; valor: number; criado_em: string; lancamento_id: string | null }>((a, b) =>
      db.from("pdv_caixa_mov").select("id, descricao, valor, criado_em, lancamento_id").eq("tipo", "sangria")
        .gte("criado_em", `${de}T03:00:00Z`).order("criado_em", { ascending: false }).order("id").range(a, b),
    ),
    categoriasDeSangria(db),
    // Contas lançadas à mão no período: mesmo valor perto da data = possível duplicidade.
    buscarTodas<{ id: string; descricao: string | null; valor: number; data: string }>((a, b) =>
      db.from("lancamentos").select("id, descricao, valor, data").gte("data", de).neq("origem", "caixa").order("id").range(a, b),
    ),
  ]);
  const lids = movs.map((m) => m.lancamento_id).filter(Boolean) as string[];
  const { data: lancs } = lids.length
    ? await db.from("lancamentos").select("id, categoria_id").in("id", lids)
    : { data: [] as { id: string; categoria_id: string | null }[] };
  const catDoLanc = new Map(((lancs as { id: string; categoria_id: string | null }[]) ?? []).map((l) => [l.id, l.categoria_id]));
  const nomeCat = new Map(categorias.map((c) => [c.id, c.nome]));

  const linhas: LinhaSangria[] = movs.map((m) => {
    const dia = diaSP(m.criado_em);
    const p = m.lancamento_id
      ? null
      : parecidos.find((l) => Math.abs(Number(l.valor) - Number(m.valor)) < 0.01 && Math.abs(meioDia(String(l.data).slice(0, 10)) - meioDia(dia)) <= 3 * 86400000);
    return {
      id: m.id,
      descricao: m.descricao ?? "",
      valor: Number(m.valor),
      dia,
      categoria: m.lancamento_id ? nomeCat.get(catDoLanc.get(m.lancamento_id) ?? "") ?? "lançada" : null,
      parecido: p ? `${p.descricao ?? "conta"} (${String(p.data).slice(8, 10)}/${String(p.data).slice(5, 7)})` : null,
    };
  });

  return (
    <div className="w-full px-4 py-5 md:px-[30px] md:py-[26px]">
      <p className="rotulo"><Link href="/salao/caixa" className="hover:text-texto">Caixa</Link></p>
      <h1 className="mt-1 font-numero text-[30px] font-bold leading-[1.05] tracking-apertada text-texto">Sangrias</h1>
      <p className="mt-1 max-w-2xl text-sm text-texto-suave">
        O que saiu do caixa em dinheiro. Com categoria, vira despesa paga no financeiro (DRE); sem categoria é só retirada (cofre, troco). Marque várias e lance de uma vez.
      </p>
      <SangriasClient linhas={linhas} categorias={categorias} de={de} />
    </div>
  );
}
