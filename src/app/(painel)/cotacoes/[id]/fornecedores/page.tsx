import Link from "next/link";
import { randomUUID } from "crypto";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buscarTodas } from "@/lib/supabase/todas";
import type { Cotacao } from "@/lib/types";
import {
  FornecedoresClient,
  type FornecedorLinha,
} from "./fornecedores-client";

export default async function CotacaoFornecedoresPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: cotData } = await supabase
    .from("cotacoes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!cotData) notFound();
  const cotacao = cotData as Cotacao;

  // Itens da cotação (produtos com quantidade > 0).
  const { data: itens } = await supabase
    .from("cotacao_itens")
    .select("produto_id, qtd")
    .eq("cotacao_id", id)
    .gt("qtd", 0);
  const produtoIds = (itens ?? []).map((i) => i.produto_id);

  let linhas: FornecedorLinha[] = [];
  // Quem entrou sozinho agora pela marca "Sempre convidar" (pra avisar na tela).
  const autoConvidados: string[] = [];
  // Texto da mensagem do WhatsApp, salvo no sistema (vale em qualquer PC).
  const { data: wcfg } = await supabase.from("wpp_config").select("msg_cotacao").maybeSingle();
  const msgSalva = ((wcfg as { msg_cotacao?: string | null } | null)?.msg_cotacao ?? null) || null;

  if (produtoIds.length > 0) {
    // Quais fornecedores fornecem esses produtos (e quantos deles).
    // Em páginas: cotação grande passa de 1000 vínculos (o banco corta em 1000).
    const vinculos = await buscarTodas<{ fornecedor_id: string; produto_id: string }>((de, ate) =>
      supabase
        .from("fornecedor_produto")
        .select("fornecedor_id, produto_id")
        .in("produto_id", produtoIds)
        .order("id")
        .range(de, ate),
    );

    const cobertura = new Map<string, number>();
    for (const v of vinculos)
      cobertura.set(v.fornecedor_id, (cobertura.get(v.fornecedor_id) ?? 0) + 1);

    const fornIds = [...cobertura.keys()];

    const [{ data: forns }, { data: convidados }] = await Promise.all([
      fornIds.length
        ? supabase
            .from("fornecedores")
            .select("id, nome, whatsapp, contato, cotacao_padrao")
            .in("id", fornIds)
            .eq("ativo", true)
        : Promise.resolve({
            data: [] as { id: string; nome: string; whatsapp: string | null; contato: string | null; cotacao_padrao: boolean }[],
          }),
      supabase
        .from("cotacao_fornecedores")
        .select("fornecedor_id, status, token, enviado_em")
        .eq("cotacao_id", id),
    ]);

    // "Sempre convidar" (migration 0242): na primeira vez que a cotação tem
    // itens e abre aqui, os marcados que vendem algo dela entram convidados.
    // Uma vez só (padrao_convidados_em) — quem foi tirado à mão não volta.
    const extra = cotData as { padrao_convidados_em?: string | null; pedidos_gerados_em?: string | null; status?: string };
    const jaConv = new Set((convidados ?? []).map((c) => c.fornecedor_id as string));
    const sempre = ((forns ?? []) as { id: string; nome: string; cotacao_padrao?: boolean }[]).filter((f) => f.cotacao_padrao && !jaConv.has(f.id));
    if (!extra.padrao_convidados_em && !extra.pedidos_gerados_em && extra.status !== "fechada" && sempre.length > 0) {
      const { data: novos } = await supabase
        .from("cotacao_fornecedores")
        .insert(sempre.map((f) => ({ cotacao_id: id, fornecedor_id: f.id, token: randomUUID().replace(/-/g, "") })))
        .select("fornecedor_id, status, token, enviado_em");
      if (novos) {
        (convidados ?? []).push(...novos);
        autoConvidados.push(...sempre.map((f) => f.nome));
        await supabase.from("cotacoes").update({ padrao_convidados_em: new Date().toISOString() }).eq("id", id);
      }
    }

    const convidadoPor = new Map(
      (convidados ?? []).map((c) => [c.fornecedor_id, c]),
    );

    linhas = (forns ?? [])
      .map((f) => {
        const conv = convidadoPor.get(f.id);
        return {
          id: f.id,
          nome: f.nome,
          whatsapp: f.whatsapp,
          contato: f.contato ?? null,
          cobertura: cobertura.get(f.id) ?? 0,
          convidado: !!conv,
          token: conv?.token ?? null,
          respondido: conv?.status === "respondido",
          enviado: !!(conv as { enviado_em?: string | null } | undefined)?.enviado_em,
          sempre: !!(f as { cotacao_padrao?: boolean }).cotacao_padrao,
        };
      })
      .sort((a, b) => b.cobertura - a.cobertura || a.nome.localeCompare(b.nome));
  }

  return (
    <div className="w-full p-8">
      <Link
        href={`/cotacoes/${cotacao.id}`}
        className="text-sm text-texto-suave hover:text-orange-600"
      >
        ← Voltar para a cotação
      </Link>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-numero text-[28px] font-bold leading-[1.1] tracking-apertada text-texto">
          Escolher fornecedores
        </h1>
        <Link
          href={`/cotacoes/${cotacao.id}/comparar`}
          className="rounded-controle border border-orange-500 px-4 py-2 text-sm font-medium text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950"
        >
          Comparar preços →
        </Link>
      </div>
      <p className="mt-1 text-texto-suave">
        Convide os fornecedores e envie o link para cada um preencher os preços.
      </p>

      {produtoIds.length === 0 ? (
        <div className="mt-6 rounded-cartao bg-painel-cartao p-12 text-center text-texto-suave">
          Nenhum item para cotar ainda.{" "}
          <Link
            href={`/cotacoes/${cotacao.id}`}
            className="font-medium text-orange-600 underline"
          >
            Volte e defina as quantidades
          </Link>{" "}
          primeiro.
        </div>
      ) : (
        <FornecedoresClient
          cotacaoId={cotacao.id}
          totalItens={produtoIds.length}
          linhas={linhas}
          msgSalva={msgSalva}
          autoConvidados={autoConvidados}
        />
      )}
    </div>
  );
}
