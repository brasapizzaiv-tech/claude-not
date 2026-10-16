import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { calcularDivergencias, notasSugeridas, type Db as DbConf } from "@/lib/conferencia-core";
import { hojeSP } from "@/lib/etiqueta-vencimentos";
import { dataBR } from "@/lib/format";
import { Enviar } from "@/components/enviar";
import { remarcarEntrega, encerrarAvisoEntrega } from "../actions";
import { ConferirClient, type ItemLinha, type NotaLigada, type NotaSugerida } from "./conferir-client";

export default async function ConferirPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("pedidos")
    .select(
      "id, data, status, observacoes, fornecedor_id, conf_colab_em, conf_colab_por, cobrar_conf, aviso_encerrado_em, nao_veio_em, nao_veio_por, nao_veio_obs, dia_entrega:pedido_dia_entrega, fornecedores(nome), cotacoes(descricao), pedido_itens(id, produto_id, qtd, preco_unit, qtd_recebida, preco_recebido, qtd_conf_colab, obs, produtos(nome, unidade))",
    )
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();

  type Row = {
    id: string;
    data: string;
    status: string;
    observacoes: string | null;
    fornecedor_id: string | null;
    conf_colab_em: string | null;
    conf_colab_por: string | null;
    cobrar_conf: boolean;
    aviso_encerrado_em: string | null;
    nao_veio_em: string | null;
    nao_veio_por: string | null;
    nao_veio_obs: string | null;
    dia_entrega: string | null;
    fornecedores: { nome?: string } | null;
    cotacoes: { descricao?: string } | null;
    pedido_itens: {
      id: string;
      produto_id: string | null;
      qtd: number;
      preco_unit: number | null;
      qtd_recebida: number | null;
      preco_recebido: number | null;
      qtd_conf_colab: number | null;
      obs: string | null;
      produtos: { nome?: string; unidade?: string } | null;
    }[];
  };
  const ped = data as unknown as Row;
  const db = supabase as unknown as DbConf;

  const [{ data: prodData }, { data: notaRow }, sugeridas, divergencias] = await Promise.all([
    supabase.from("produtos").select("id, nome").eq("ativo", true).order("nome"),
    supabase
      .from("notas_fiscais")
      .select("id, numero, valor, data_emissao, nota_itens(produto_id, descricao, qtd, valor_unit, fator)")
      .eq("pedido_id", id)
      .limit(1)
      .maybeSingle(),
    notasSugeridas(db, ped.fornecedor_id, ped.data),
    calcularDivergencias(db, id),
  ]);
  const produtos = (prodData as { id: string; nome: string }[]) ?? [];

  // Nota ligada: agrupa por produto (fator aplicado) pra mostrar ao lado do item.
  type NI = { produto_id: string | null; descricao: string | null; qtd: number; valor_unit: number | null; fator: number | null };
  const nota = notaRow as unknown as { id: string; numero: string | null; valor: number; data_emissao: string | null; nota_itens: NI[] } | null;
  const notaPorProduto = new Map<string, { qtd: number; valor: number }>();
  let notaSemVinculo = 0;
  for (const ni of nota?.nota_itens ?? []) {
    if (!ni.produto_id) { notaSemVinculo++; continue; }
    const f = Number(ni.fator ?? 1) || 1;
    const a = notaPorProduto.get(ni.produto_id) ?? { qtd: 0, valor: 0 };
    a.qtd += Number(ni.qtd) * f;
    a.valor += Number(ni.qtd) * Number(ni.valor_unit ?? 0);
    notaPorProduto.set(ni.produto_id, a);
  }
  const notaLigada: NotaLigada | null = nota
    ? { id: nota.id, numero: nota.numero, valor: Number(nota.valor), data_emissao: nota.data_emissao, itens: nota.nota_itens.length, semVinculo: notaSemVinculo }
    : null;

  const itens: ItemLinha[] = (ped.pedido_itens ?? [])
    .map((i) => {
      const n = i.produto_id ? notaPorProduto.get(i.produto_id) : undefined;
      return {
        id: i.id,
        nome: i.produtos?.nome ?? "—",
        unidade: i.produtos?.unidade ?? "",
        qtd: i.qtd,
        preco_unit: i.preco_unit,
        qtd_recebida: i.qtd_recebida,
        preco_recebido: i.preco_recebido,
        qtd_conf_colab: i.qtd_conf_colab,
        obs: i.obs,
        nota_qtd: n && n.qtd > 0 ? Math.round(n.qtd * 1000) / 1000 : null,
        nota_preco: n && n.qtd > 0 ? Math.round((n.valor / n.qtd) * 100) / 100 : null,
      };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome));

  // Entrega do fornecedor (migration 0228): o que a equipe respondeu e o que o
  // escritório pode fazer — remarcar a data ou encerrar o aviso.
  const hoje = hojeSP();
  const dia = ped.dia_entrega ? String(ped.dia_entrega).slice(0, 10) : null;
  const mostrarEntrega = ped.cobrar_conf && !ped.conf_colab_em && (ped.status === "rascunho" || ped.status === "enviado");
  const entrega = mostrarEntrega && (
    <div className={`mx-8 mt-6 rounded-cartao border p-4 text-sm ${ped.nao_veio_em && !ped.aviso_encerrado_em ? "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/30" : "border-borda bg-painel-cartao"}`}>
      <p className="font-semibold text-texto">
        Entrega prevista: {dia ? dataBR(dia) : "—"}
        {ped.aviso_encerrado_em ? " · aviso encerrado" : ped.nao_veio_em ? " · a equipe avisou que NÃO VEIO" : dia && dia < hoje ? " · passou do dia e ninguém conferiu" : " · a equipe vai ser perguntada no dia"}
      </p>
      {ped.nao_veio_em && (
        <p className="mt-1 text-texto-suave">
          Avisado por {ped.nao_veio_por ?? "equipe"} em {new Date(ped.nao_veio_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
          {ped.nao_veio_obs ? ` — "${ped.nao_veio_obs}"` : ""}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <form action={remarcarEntrega} className="flex items-end gap-2">
          <input type="hidden" name="id" value={ped.id} />
          <label className="text-xs text-texto-suave">
            Vai chegar em
            <input type="date" name="dia" required min={hoje} defaultValue={dia && dia >= hoje ? dia : ""} className="mt-0.5 block rounded-controle border border-borda-forte bg-transparent px-2 py-1.5 text-sm" />
          </label>
          <Enviar className="btn-principal">Remarcar entrega</Enviar>
        </form>
        {!ped.aviso_encerrado_em && (
          <form action={encerrarAvisoEntrega}>
            <input type="hidden" name="id" value={ped.id} />
            <Enviar className="rounded-controle border border-borda-forte px-3 py-1.5">Encerrar aviso (não vem / resolvido)</Enviar>
          </form>
        )}
      </div>
    </div>
  );

  return (
    <>
    {entrega}
    <ConferirClient
      pedidoId={ped.id}
      fornecedor={ped.fornecedores?.nome ?? "—"}
      cotacao={ped.cotacoes?.descricao ?? ""}
      data={ped.data}
      status={ped.status}
      observacoes={ped.observacoes ?? ""}
      confColab={ped.conf_colab_em ? { em: ped.conf_colab_em, por: ped.conf_colab_por } : null}
      itens={itens}
      produtos={produtos}
      nota={notaLigada}
      sugeridas={sugeridas as NotaSugerida[]}
      divergencias={divergencias}
    />
    </>
  );
}
