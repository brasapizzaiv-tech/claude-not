import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { exigirAcesso } from "@/lib/permissoes-server";
import { carregarFichas, TEXTO_PROBLEMA } from "@/lib/fichas";
import { EditorFicha, type LinhaItem } from "./editor";

export const metadata = { title: "Ficha técnica" };
export const dynamic = "force-dynamic";

export default async function FichaPage({ params }: { params: Promise<{ id: string }> }) {
  await exigirAcesso("/fichas-tecnicas");
  const { id } = await params;
  const supabase = await createClient();
  const { fichas, itens, produtos, custos } = await carregarFichas(supabase, { soAtivas: false });
  const ficha = fichas.find((f) => f.id === id);
  if (!ficha) notFound();
  const custo = custos.get(id)!;
  const nomeFicha = new Map(fichas.map((f) => [f.id, f.nome]));

  const linhas: LinhaItem[] = itens
    .filter((i) => i.ficha_id === id)
    .map((i) => {
      const c = custo.itens.get(i.id);
      const p = i.produto_id ? produtos.get(i.produto_id) : null;
      return {
        id: i.id,
        descricao: i.descricao,
        quantidade: Number(i.quantidade),
        unidade: i.unidade,
        conversao: i.conversao != null ? Number(i.conversao) : null,
        conversaoUsada: c?.conversaoUsada ?? null,
        produto: p ? { id: p.id, nome: p.nome, unidade: p.unidade, preco: p.preco_referencia != null ? Number(p.preco_referencia) : null } : null,
        subFicha: i.sub_ficha_id ? { id: i.sub_ficha_id, nome: nomeFicha.get(i.sub_ficha_id) ?? "ficha", custoKg: custos.get(i.sub_ficha_id)?.custoKg ?? null } : null,
        custo: c?.custo ?? null,
        fonte: c?.fonte ?? null,
        problema: c?.problema ? TEXTO_PROBLEMA[c.problema] : null,
        precoPlanilha: i.preco_planilha != null ? Number(i.preco_planilha) : null,
      };
    });

  const usadaEm = [...new Set(itens.filter((i) => i.sub_ficha_id === id).map((i) => i.ficha_id))].map((fid) => ({ id: fid, nome: nomeFicha.get(fid) ?? "" }));
  const { data: pratosData } = await supabase.from("cardapio_itens").select("id, nome").eq("ficha_id", id).eq("ativo", true).order("nome");
  const pratos = (pratosData as { id: string; nome: string }[] | null) ?? [];
  const categorias = [...new Set(fichas.map((f) => f.categoria).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b, "pt-BR"));

  return (
    <div className="pagina space-y-5">
      <Link href="/fichas-tecnicas" className="inline-flex min-h-11 items-center text-sm font-semibold text-texto-marca">← Fichas técnicas</Link>
      <EditorFicha
        ficha={{ ...ficha, rendimento_kg: ficha.rendimento_kg != null ? Number(ficha.rendimento_kg) : null, custo_kg_planilha: ficha.custo_kg_planilha != null ? Number(ficha.custo_kg_planilha) : null }}
        linhas={linhas}
        total={custo.total}
        custoKg={custo.custoKg}
        pendencias={custo.pendencias}
        usaPlanilha={custo.usaPlanilha}
        usadaEm={usadaEm}
        pratos={pratos}
        categorias={categorias}
      />
    </div>
  );
}
