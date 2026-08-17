import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { servicoAgora } from "../../util";
import { QRComanda, LancarItens } from "./cliente";
import type { PizzaOpcao, ComboGrupo } from "./cliente";
import { ImprimirComanda } from "./print";
import { AcoesComanda } from "./acoes";
import { removerItemComanda, fecharComanda, reabrirComanda } from "../../actions";

const moeda = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default async function ComandaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: comanda } = await supabase
    .from("pdv_comandas")
    .select("id, numero, mesa, status, peso, tara, valor_buffet, livre, servico, forma_pagamento, aberta_em")
    .eq("id", id)
    .single();
  if (!comanda) notFound();

  const [
    { data: itens },
    { data: cardapio },
    { data: cfgRows },
    { data: outrasRows },
    { data: catRows },
  ] = await Promise.all([
    supabase
      .from("pdv_comanda_itens")
      .select("id, descricao, qtd, preco_unit")
      .eq("comanda_id", id)
      .order("criado_em"),
    supabase.from("pdv_itens").select("id, nome, categoria, preco").eq("ativo", true).order("nome"),
    supabase.from("pdv_config").select("chave, valor"),
    supabase
      .from("pdv_comandas")
      .select("id, numero")
      .eq("status", "aberta")
      .neq("id", id)
      .order("numero"),
    supabase
      .from("pdv_categorias")
      .select("nome, disponivel, ordem")
      .eq("disponivel", true)
      .order("ordem"),
  ]);
  const outras = (outrasRows as { id: string; numero: number }[]) ?? [];
  const categoriasOrdenadas = ((catRows as { nome: string }[]) ?? []).map((c) => c.nome);
  const catDisp = new Set(categoriasOrdenadas);
  // só itens de categorias disponíveis (ou sem categoria)
  const cardapioDisp = (
    (cardapio as { id: string; nome: string; categoria: string | null; preco: number }[]) ?? []
  ).filter((i) => !i.categoria || catDisp.has(i.categoria));

  // Complementos (marmitas): grupos + opções ativas dos itens do cardápio disponível
  const complementos: Record<string, ComboGrupo[]> = {};
  const itemIds = cardapioDisp.map((i) => i.id);
  if (itemIds.length) {
    const { data: gruposRows } = await supabase
      .from("pdv_item_grupos")
      .select("id, item_id, nome, min, max, permite_repetir, ordem")
      .in("item_id", itemIds)
      .order("ordem");
    const grupos = (gruposRows as {
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
      for (const o of (opcoesRows as {
        id: string;
        grupo_id: string;
        nome: string;
        preco: number;
      }[]) ?? []) {
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

  const cfg: Record<string, string> = {};
  for (const r of cfgRows ?? []) cfg[r.chave] = r.valor;

  // Dados das pizzas (montador)
  const [{ data: tamRows }, { data: sabRows }, { data: sabPr }, { data: brdRows }, { data: brdPr }] =
    await Promise.all([
      supabase.from("pdv_pizza_tamanhos").select("id, nome, max_sabores").order("ordem"),
      supabase.from("pdv_pizza_sabores").select("id, nome, ordem").eq("ativo", true).order("nome"),
      supabase.from("pdv_pizza_sabor_precos").select("sabor_id, tamanho_id, preco"),
      supabase.from("pdv_pizza_bordas").select("id, nome, ordem").eq("ativo", true).order("nome"),
      supabase.from("pdv_pizza_borda_precos").select("borda_id, tamanho_id, preco"),
    ]);
  const pizzaTamanhos = (tamRows ?? []).map((t) => ({
    id: t.id as string,
    nome: t.nome as string,
    max: Number(t.max_sabores),
  }));
  const montarOpcoes = (
    rows: { id: string; nome: string }[],
    fk: "sabor_id" | "borda_id",
    precosRows: Record<string, unknown>[],
  ): PizzaOpcao[] =>
    rows.map((r) => {
      const precosMap: Record<string, number> = {};
      for (const pr of precosRows) {
        if (pr[fk] === r.id) precosMap[pr.tamanho_id as string] = Number(pr.preco);
      }
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

  const lista =
    (itens as { id: string; descricao: string; qtd: number; preco_unit: number }[]) ?? [];
  const fechada = comanda.status === "fechada";
  const temBuffet = Number(comanda.valor_buffet) > 0 || Number(comanda.peso ?? 0) > 0;

  const subtotal =
    Number(comanda.valor_buffet) +
    lista.reduce((s, i) => s + Number(i.qtd) * Number(i.preco_unit), 0);
  const perc = fechada
    ? subtotal > 0
      ? (Number(comanda.servico) / subtotal) * 100
      : 0
    : servicoAgora(cfg);
  const servico = fechada ? Number(comanda.servico) : Math.round(subtotal * perc) / 100;
  const total = subtotal + servico;

  const dataHora = new Date(comanda.aberta_em).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="mx-auto max-w-xl p-6">
      <Link href="/salao" className="text-sm text-zinc-500 hover:text-orange-600">
        ← Salão
      </Link>

      {/* Cupom da comanda */}
      <div className="comanda-cupom mt-3 rounded-2xl border border-zinc-200 bg-white p-5 text-center dark:border-zinc-800 dark:bg-zinc-950">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo-brasa.png"
          alt=""
          className="mx-auto mb-2 h-14 w-14 object-contain"
        />
        <p className="text-lg font-extrabold uppercase tracking-wide text-zinc-900 dark:text-zinc-50">
          {cfg.nome_restaurante || "Restaurante"}
        </p>
        {(cfg.cupom_endereco || cfg.cupom_telefone) && (
          <p className="text-[11px] text-zinc-500">
            {cfg.cupom_endereco}
            {cfg.cupom_endereco && cfg.cupom_telefone ? " · " : ""}
            {cfg.cupom_telefone}
          </p>
        )}
        <p className="mt-1 text-xs uppercase tracking-wide text-zinc-400">
          Comanda {comanda.mesa ? `· ${comanda.mesa}` : ""} {fechada ? "· fechada" : ""}
        </p>
        <p className="text-4xl font-black text-zinc-900 dark:text-zinc-50">
          #{comanda.numero}
        </p>

        {temBuffet && (
          <div className="mx-auto mt-4 grid max-w-sm grid-cols-3 gap-2 text-sm">
            <div className="rounded-lg bg-zinc-50 p-2 dark:bg-zinc-900">
              <p className="text-[11px] uppercase text-zinc-400">Peso</p>
              <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                {Number(comanda.peso ?? 0)} kg
              </p>
            </div>
            <div className="rounded-lg bg-zinc-50 p-2 dark:bg-zinc-900">
              <p className="text-[11px] uppercase text-zinc-400">Tara</p>
              <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                {Number(comanda.tara ?? 0)} kg
              </p>
            </div>
            <div className="rounded-lg bg-zinc-50 p-2 dark:bg-zinc-900">
              <p className="text-[11px] uppercase text-zinc-400">Valor</p>
              <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                {moeda(Number(comanda.valor_buffet))}
              </p>
            </div>
          </div>
        )}

        {comanda.livre && (
          <p className="mt-2 text-xs font-semibold text-orange-600">BUFFET LIVRE</p>
        )}

        <div className="mt-4 flex justify-center">
          <QRComanda id={comanda.id} />
        </div>
        <p className="mt-2 text-[11px] text-zinc-400">{dataHora}</p>
        {cfg.cupom_msg && (
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
            {cfg.cupom_msg}
          </p>
        )}

        {/* Itens + totais — aparecem SÓ na impressão */}
        <div className="hidden text-left text-[12px] leading-snug print:block">
          <div className="my-2 border-t border-black/40" />
          {temBuffet && (
            <div className="flex justify-between gap-2">
              <span>Buffet{comanda.peso ? ` (${comanda.peso} kg)` : ""}</span>
              <span>{moeda(Number(comanda.valor_buffet))}</span>
            </div>
          )}
          {lista.map((i) => {
            const linhas = i.descricao.split("\n");
            return (
              <div key={i.id} className="mt-1">
                <div className="flex justify-between gap-2">
                  <span>
                    {Number(i.qtd) > 1 ? `${i.qtd}× ` : ""}
                    {linhas[0]}
                  </span>
                  <span>{moeda(Number(i.qtd) * Number(i.preco_unit))}</span>
                </div>
                {linhas.slice(1).map((l, idx) => (
                  <div key={idx} className="pl-3">
                    {l}
                  </div>
                ))}
              </div>
            );
          })}
          <div className="my-2 border-t border-black/40" />
          <div className="flex justify-between gap-2">
            <span>Subtotal</span>
            <span>{moeda(subtotal)}</span>
          </div>
          {servico > 0 && (
            <div className="flex justify-between gap-2">
              <span>Serviço ({Math.round(perc)}%)</span>
              <span>{moeda(servico)}</span>
            </div>
          )}
          <div className="flex justify-between gap-2 text-base font-bold">
            <span>TOTAL</span>
            <span>{moeda(total)}</span>
          </div>
        </div>
      </div>

      <div className="mt-3 flex justify-center">
        <ImprimirComanda />
      </div>

      {/* Itens */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {temBuffet && (
              <tr className="bg-white dark:bg-zinc-950">
                <td className="px-4 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                  Buffet{comanda.peso ? ` (${comanda.peso} kg)` : ""}
                </td>
                <td className="px-4 py-2 text-right text-zinc-700 dark:text-zinc-300">
                  {moeda(Number(comanda.valor_buffet))}
                </td>
                <td className="px-4 py-2" />
              </tr>
            )}
            {lista.map((i) => (
              <tr key={i.id} className="bg-white dark:bg-zinc-950">
                <td className="whitespace-pre-line px-4 py-2 text-zinc-800 dark:text-zinc-200">
                  {Number(i.qtd) > 1 ? `${i.qtd}× ` : ""}
                  {i.descricao}
                </td>
                <td className="px-4 py-2 text-right align-top text-zinc-700 dark:text-zinc-300">
                  {moeda(Number(i.qtd) * Number(i.preco_unit))}
                </td>
                <td className="px-4 py-2 text-right">
                  {!fechada && (
                    <form action={removerItemComanda} className="inline">
                      <input type="hidden" name="id" value={i.id} />
                      <input type="hidden" name="comanda_id" value={comanda.id} />
                      <button className="text-zinc-300 hover:text-red-600 dark:text-zinc-600">
                        ×
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!fechada && (
        <div className="mt-3">
          <LancarItens
            comandaId={comanda.id}
            itens={cardapioDisp}
            categoriasOrdenadas={categoriasOrdenadas}
            complementos={complementos}
            pizzaTamanhos={pizzaTamanhos}
            pizzaSabores={pizzaSabores}
            pizzaBordas={pizzaBordas}
          />
        </div>
      )}

      {/* Totais */}
      <div className="mt-6 space-y-1 rounded-2xl border border-zinc-200 p-4 text-sm dark:border-zinc-800">
        <div className="flex justify-between text-zinc-500">
          <span>Subtotal</span>
          <span>{moeda(subtotal)}</span>
        </div>
        {servico > 0 && (
          <div className="flex justify-between text-zinc-500">
            <span>Serviço ({Math.round(perc)}%)</span>
            <span>{moeda(servico)}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-zinc-100 pt-1 text-lg font-bold text-zinc-900 dark:border-zinc-800 dark:text-zinc-50">
          <span>Total</span>
          <span>{moeda(total)}</span>
        </div>
      </div>

      {/* Fechar / reabrir */}
      {fechada ? (
        <div className="mt-4 flex items-center justify-between">
          <span className="text-sm text-green-600">
            ✓ Paga{comanda.forma_pagamento ? ` · ${comanda.forma_pagamento}` : ""}
          </span>
          <form action={reabrirComanda}>
            <input type="hidden" name="id" value={comanda.id} />
            <button className="text-sm text-zinc-400 hover:text-orange-600">
              Reabrir
            </button>
          </form>
        </div>
      ) : (
        <form action={fecharComanda} className="mt-4 flex flex-wrap items-end gap-2">
          <input type="hidden" name="id" value={comanda.id} />
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Pagamento</label>
            <select
              name="forma"
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            >
              <option value="Dinheiro">Dinheiro</option>
              <option value="Pix">Pix</option>
              <option value="Cartão de débito">Cartão de débito</option>
              <option value="Cartão de crédito">Cartão de crédito</option>
            </select>
          </div>
          <button className="rounded-lg bg-green-600 px-5 py-2 text-sm font-semibold text-white hover:bg-green-700">
            Fechar e receber ({moeda(total)})
          </button>
        </form>
      )}

      {!fechada && (
        <AcoesComanda
          comandaId={comanda.id}
          peso={Number(comanda.peso ?? 0)}
          tara={Number(comanda.tara ?? 0)}
          outras={outras}
        />
      )}
    </div>
  );
}
