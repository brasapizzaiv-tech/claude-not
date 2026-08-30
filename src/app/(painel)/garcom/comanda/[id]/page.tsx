import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LancarItens } from "../../../salao/comandas/[id]/cliente";
import type { PizzaOpcao, ComboGrupo } from "../../../salao/comandas/[id]/cliente";
import { removerItemComanda } from "../../../salao/actions";

const moeda = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default async function GarcomComandaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: comanda } = await supabase
    .from("pdv_comandas")
    .select("id, numero, mesa, status")
    .eq("id", id)
    .single();
  if (!comanda) notFound();
  const fechada = comanda.status === "fechada";

  const [
    { data: itens },
    { data: cardapio },
    { data: catRows },
    { data: tamRows },
    { data: sabRows },
    { data: sabPr },
    { data: brdRows },
    { data: brdPr },
  ] = await Promise.all([
    supabase
      .from("pdv_comanda_itens")
      .select("id, descricao, qtd, preco_unit")
      .eq("comanda_id", id)
      .order("criado_em"),
    supabase.from("pdv_itens").select("id, nome, categoria, preco").eq("ativo", true).eq("canal_garcom", true).eq("disponivel", true).order("nome"),
    supabase.from("pdv_categorias").select("nome").eq("disponivel", true).eq("canal_garcom", true).order("ordem"),
    supabase.from("pdv_pizza_tamanhos").select("id, nome, max_sabores").order("ordem"),
    supabase.from("pdv_pizza_sabores").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("pdv_pizza_sabor_precos").select("sabor_id, tamanho_id, preco"),
    supabase.from("pdv_pizza_bordas").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("pdv_pizza_borda_precos").select("borda_id, tamanho_id, preco"),
  ]);

  const lista =
    (itens as { id: string; descricao: string; qtd: number; preco_unit: number }[]) ?? [];
  const total = lista.reduce((s, i) => s + Number(i.qtd) * Number(i.preco_unit), 0);

  const categoriasOrdenadas = ((catRows as { nome: string }[]) ?? []).map((c) => c.nome);
  const catDisp = new Set(categoriasOrdenadas);
  const cardapioDisp = (
    (cardapio as { id: string; nome: string; categoria: string | null; preco: number }[]) ?? []
  ).filter((i) => !i.categoria || catDisp.has(i.categoria));

  // Complementos
  const complementos: Record<string, ComboGrupo[]> = {};
  const itemIds = cardapioDisp.map((i) => i.id);
  if (itemIds.length) {
    const { data: gruposRows } = await supabase
      .from("pdv_item_grupos")
      .select("id, item_id, nome, min, max, permite_repetir, ordem")
      .in("item_id", itemIds)
      .order("ordem");
    const grupos =
      (gruposRows as {
        id: string;
        item_id: string;
        nome: string;
        min: number;
        max: number;
        permite_repetir: boolean;
      }[]) ?? [];
    if (grupos.length) {
      const { data: opcoesRows } = await supabase
        .from("pdv_item_opcoes")
        .select("id, grupo_id, nome, preco, ordem")
        .in("grupo_id", grupos.map((g) => g.id))
        .eq("ativo", true)
        .order("ordem");
      const porGrupo = new Map<string, { id: string; nome: string; preco: number }[]>();
      for (const o of (opcoesRows as { id: string; grupo_id: string; nome: string; preco: number }[]) ?? []) {
        porGrupo.set(o.grupo_id, [
          ...(porGrupo.get(o.grupo_id) ?? []),
          { id: o.id, nome: o.nome, preco: Number(o.preco) },
        ]);
      }
      for (const g of grupos) {
        complementos[g.item_id] = [
          ...(complementos[g.item_id] ?? []),
          {
            id: g.id,
            nome: g.nome,
            min: Number(g.min),
            max: Number(g.max),
            permite_repetir: !!g.permite_repetir,
            opcoes: porGrupo.get(g.id) ?? [],
          },
        ];
      }
    }
  }

  // Pizzas
  const pizzaTamanhos = ((tamRows as { id: string; nome: string; max_sabores: number }[]) ?? []).map(
    (t) => ({ id: t.id, nome: t.nome, max: Number(t.max_sabores) }),
  );
  const montarOpcoes = (
    rows: { id: string; nome: string }[],
    fk: "sabor_id" | "borda_id",
    precosRows: Record<string, unknown>[],
  ): PizzaOpcao[] =>
    rows.map((r) => {
      const precosMap: Record<string, number> = {};
      for (const pr of precosRows) if (pr[fk] === r.id) precosMap[pr.tamanho_id as string] = Number(pr.preco);
      return { id: r.id, nome: r.nome, precos: precosMap };
    });
  const pizzaSabores = montarOpcoes(
    (sabRows as { id: string; nome: string }[]) ?? [],
    "sabor_id",
    (sabPr as Record<string, unknown>[]) ?? [],
  );
  const pizzaBordas = montarOpcoes(
    (brdRows as { id: string; nome: string }[]) ?? [],
    "borda_id",
    (brdPr as Record<string, unknown>[]) ?? [],
  );

  return (
    <div className="mx-auto max-w-xl p-4 pb-24">
      <div className="mb-3 flex items-center justify-between">
        <Link href="/garcom" className="text-sm text-zinc-500 hover:text-orange-600">
          ← Mesas
        </Link>
        <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          {comanda.mesa} · #{comanda.numero}
        </span>
      </div>

      {/* Itens lançados */}
      <div className="mb-4 overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
        {lista.length === 0 ? (
          <p className="p-4 text-center text-sm text-zinc-400">Nada lançado ainda.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {lista.map((i) => (
                <tr key={i.id} className="bg-white dark:bg-zinc-950">
                  <td className="whitespace-pre-line px-3 py-2 text-zinc-800 dark:text-zinc-200">
                    {Number(i.qtd) > 1 ? `${i.qtd}× ` : ""}
                    {i.descricao}
                  </td>
                  <td className="px-3 py-2 text-right align-top text-zinc-600 dark:text-zinc-300">
                    {moeda(Number(i.qtd) * Number(i.preco_unit))}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {!fechada && (
                      <form action={removerItemComanda} className="inline">
                        <input type="hidden" name="id" value={i.id} />
                        <input type="hidden" name="comanda_id" value={comanda.id} />
                        <button className="text-zinc-300 hover:text-red-600 dark:text-zinc-600">×</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
              <tr className="bg-zinc-50 dark:bg-zinc-900">
                <td className="px-3 py-2 font-semibold text-zinc-900 dark:text-zinc-100">Total</td>
                <td className="px-3 py-2 text-right font-semibold text-zinc-900 dark:text-zinc-100">
                  {moeda(total)}
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        )}
      </div>

      {fechada ? (
        <p className="rounded-xl bg-green-50 p-3 text-center text-sm text-green-700 dark:bg-green-950/30">
          Comanda fechada.
        </p>
      ) : (
        <LancarItens
          comandaId={comanda.id}
          itens={cardapioDisp}
          categoriasOrdenadas={categoriasOrdenadas}
          complementos={complementos}
          pizzaTamanhos={pizzaTamanhos}
          pizzaSabores={pizzaSabores}
          pizzaBordas={pizzaBordas}
        />
      )}
    </div>
  );
}
