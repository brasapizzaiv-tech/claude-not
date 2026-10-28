import Link from "next/link";
import { Enviar } from "@/components/enviar";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { servicoAgora } from "../../util";
import { LancarItens, ReimprimirCozinha } from "./cliente";
import type { PizzaOpcao, ComboGrupo } from "./cliente";
import { AcoesComanda } from "./acoes";
import { removerItemComanda } from "../../actions";

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
    .select("id, numero, mesa, status, peso, tara, valor_buffet, livre, so_kg, servico, forma_pagamento, aberta_em, conta_pedida_em, conta_pedida_por")
    .eq("id", id)
    .single();
  if (!comanda) notFound();

  const [
    { data: itens },
    { data: cardapio },
    { data: cfgRows },
    { data: catRows },
  ] = await Promise.all([
    supabase
      .from("pdv_comanda_itens")
      .select("id, descricao, qtd, preco_unit, lancamento_id, criado_em")
      .eq("comanda_id", id)
      .order("criado_em"),
    supabase.from("pdv_itens").select("id, nome, categoria, preco, por_kg").eq("ativo", true).eq("disponivel", true).eq("combo", false).order("nome"),
    supabase.from("pdv_config").select("chave, valor"),
    supabase
      .from("pdv_categorias")
      .select("nome, disponivel, ordem")
      .eq("disponivel", true)
      .order("ordem"),
  ]);
  const categoriasOrdenadas = ((catRows as { nome: string }[]) ?? []).map((c) => c.nome);
  const catDisp = new Set(categoriasOrdenadas);
  // só itens de categorias disponíveis (ou sem categoria)
  const cardapioDisp = (
    (cardapio as { id: string; nome: string; categoria: string | null; preco: number; por_kg?: boolean }[]) ?? []
  ).filter((i) => !i.categoria || catDisp.has(i.categoria));

  // Complementos (marmitas): grupos + opções ativas dos itens do cardápio disponível
  const complementos: Record<string, ComboGrupo[]> = {};
  const itemIds = cardapioDisp.map((i) => i.id);
  if (itemIds.length) {
    const { data: gruposRows } = await supabase
      .from("pdv_item_grupos")
      .select("id, item_id, nome, min, max, permite_repetir, media, ordem")
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
    (itens as { id: string; descricao: string; qtd: number; preco_unit: number; lancamento_id: string | null; criado_em: string }[]) ?? [];
  // Itens juntos por pedido (o que foi pra cozinha de uma vez), na ordem.
  const pedidos: { lanc: string | null; hora: string; itens: typeof lista }[] = [];
  for (const i of lista) {
    const g = pedidos.find((p) => p.lanc === i.lancamento_id);
    if (g) g.itens.push(i);
    else pedidos.push({ lanc: i.lancamento_id, hora: new Date(i.criado_em).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }), itens: [i] });
  }
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

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 md:px-[30px] md:py-[26px]">
      {/* Topo: rótulo + número grande, como as outras telas do layout novo. */}
      <p className="rotulo">
        <Link href="/salao" className="hover:text-texto">Salão</Link> · comanda{comanda.mesa ? ` · ${comanda.mesa}` : ""}
      </p>
      <h1 className="mt-1 flex flex-wrap items-center gap-3 font-numero text-[30px] font-bold leading-[1.05] tracking-apertada text-texto">
        #{comanda.numero}
        {fechada ? <span className="pilula pilula-neutra">fechada</span> : comanda.conta_pedida_em ? <span className="pilula pilula-urgente">pediu a conta</span> : <span className="pilula">aberta</span>}
        {comanda.livre && <span className="pilula pilula-grafite">buffet livre</span>}
      </h1>

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          {/* Itens */}
          <section className="cartao p-2" aria-label="Itens da comanda">
            <p className="rotulo px-3 pb-1 pt-2">Itens</p>
            {!temBuffet && lista.length === 0 ? (
              <p className="px-3 pb-4 pt-2 text-sm text-texto-suave">Nenhum item ainda. Lance abaixo.</p>
            ) : (
              <ul className="flex flex-col">
                {temBuffet && (
                  <li className="flex items-center gap-3 rounded-controle px-3 py-2.5">
                    <span className="flex-1 text-sm font-medium text-texto">Buffet{comanda.peso ? ` (${comanda.peso} kg)` : ""}</span>
                    <span className="font-numero text-[15px] font-bold text-texto">{moeda(Number(comanda.valor_buffet))}</span>
                    <span className="w-11" />
                  </li>
                )}
                {pedidos.map((p) => [
                  <li key={`p-${p.lanc ?? "solto"}`} className="mt-1 flex items-center justify-between gap-2 px-3 pt-1">
                    <span className="rotulo">{p.lanc ? `Pedido das ${p.hora}` : "Lançado no caixa"}</span>
                    {!fechada && <ReimprimirCozinha comandaId={comanda.id} lancamentoId={p.lanc} />}
                  </li>,
                  ...p.itens.map((i) => (
                  <li key={i.id} className="flex items-center gap-3 rounded-controle px-3 py-1.5 hover:bg-painel-fundo">
                    <span className="min-w-0 flex-1 whitespace-pre-line text-sm text-texto">
                      {Number(i.qtd) > 1 ? <span className="font-semibold">{i.qtd}× </span> : null}
                      {i.descricao}
                    </span>
                    <span className="font-numero text-[15px] font-bold text-texto">{moeda(Number(i.qtd) * Number(i.preco_unit))}</span>
                    {!fechada ? (
                      <form action={removerItemComanda} className="inline">
                        <input type="hidden" name="id" value={i.id} />
                        <input type="hidden" name="comanda_id" value={comanda.id} />
                        <Enviar className="flex h-11 w-11 items-center justify-center rounded-controle text-texto-fraco hover:bg-urgente-fundo hover:text-urgente-texto" aria-label={`Tirar ${i.descricao}`}>
                          ×
                        </Enviar>
                      </form>
                    ) : <span className="w-11" />}
                  </li>
                  )),
                ])}
              </ul>
            )}
          </section>

          {!fechada && (
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

        {/* Cartão de foco: o total e o que fazer com ele. */}
        <aside className="flex flex-col gap-3">
          <div className="cartao-foco flex flex-col gap-2 p-5" style={{ "--foco": "var(--painel-foco-texto)" } as React.CSSProperties}>
            <span className="rotulo !text-painel-foco-rotulo">Total da comanda</span>
            <p className="numero-grande text-[36px]">{moeda(total)}</p>
            <div className="flex flex-col gap-1 border-t border-painel-foco-linha pt-2 text-sm">
              <div className="flex justify-between text-painel-foco-suave"><span>Subtotal</span><span className="font-numero">{moeda(subtotal)}</span></div>
              {servico > 0 && (
                <div className="flex justify-between text-painel-foco-suave"><span>Serviço ({Math.round(perc)}%)</span><span className="font-numero">{moeda(servico)}</span></div>
              )}
            </div>
            {!fechada && (
              <Link href={`/salao/caixa?abrir=${comanda.id}`} className="btn-principal mt-2 w-full text-sm">Receber no caixa</Link>
            )}
            <p className="text-center text-xs text-painel-foco-suave">O pagamento é feito no caixa. Aqui você adiciona ou retira itens.</p>
          </div>
          {!fechada && <AcoesComanda
              comandaId={comanda.id}
              livre={!!comanda.livre}
              temBuffet={temBuffet}
              contaPedida={!!comanda.conta_pedida_em}
              contaPedidaPor={comanda.conta_pedida_por as string | null}
            />}
        </aside>
      </div>
    </div>
  );
}
