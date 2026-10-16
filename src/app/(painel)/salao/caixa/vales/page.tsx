import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listarFormas } from "@/lib/formas-pagamento-server";
import { naoEntraNoCaixa } from "@/lib/formas-pagamento";
import { ValesClient, type ValeLinha } from "./vales-client";

// VALES-PRESENTE COM CÓDIGO (migration 0235)
// Venda no caixa (o dinheiro entra no dia), código pra dar baixa, saldo que
// vai sendo usado aos poucos, validade (3 meses), e o cartão do cliente:
// imagem pro WhatsApp, cupom na térmica e cartão pra imprimir.
export const metadata = { title: "Vales-presente · Brasa" };

export default async function ValesPage({ searchParams }: { searchParams: Promise<{ q?: string; todos?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: rows }, { data: cx }, formasCaixa] = await Promise.all([
    supabase
      .from("vales_presente")
      .select("id, codigo, valor, saldo, para_nome, de_nome, mensagem, telefone, validade, forma_pagamento, status, cancelado_motivo, criado_em, vales_presente_usos(id, tipo, valor, origem, obs, criado_em)")
      .order("criado_em", { ascending: false })
      .limit(500),
    supabase.from("pdv_caixas").select("id").eq("status", "aberto").limit(1).maybeSingle(),
    listarFormas("caixa"),
  ]);

  type Row = {
    id: string; codigo: string; valor: number; saldo: number; para_nome: string | null; de_nome: string | null; mensagem: string | null;
    telefone: string | null; validade: string; forma_pagamento: string | null; status: string; cancelado_motivo: string | null; criado_em: string;
    vales_presente_usos: { id: string; tipo: string; valor: number; origem: string | null; obs: string | null; criado_em: string }[] | null;
  };
  const vales: ValeLinha[] = ((rows as Row[]) ?? []).map((r) => ({
    id: r.id,
    codigo: r.codigo,
    valor: Number(r.valor),
    saldo: Number(r.saldo),
    para: r.para_nome,
    de: r.de_nome,
    mensagem: r.mensagem,
    telefone: r.telefone,
    validade: r.validade,
    forma: r.forma_pagamento,
    status: r.status,
    canceladoMotivo: r.cancelado_motivo,
    criadoEm: r.criado_em,
    usos: (r.vales_presente_usos ?? [])
      .map((u) => ({ id: u.id, tipo: u.tipo, valor: Number(u.valor), origem: u.origem, obs: u.obs, criadoEm: u.criado_em }))
      .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm)),
  }));

  // Formas que pagam um vale: as que entram no caixa (não cortesia/vale, não fiado/equipe).
  const formas = formasCaixa.filter((f) => !naoEntraNoCaixa(f.tipo) && f.tipo !== "saldo" && f.tipo !== "equipe");

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6">
      <Link href="/salao/caixa" className="text-sm font-semibold text-texto-marca hover:underline">← Voltar ao caixa</Link>
      <h1 className="mt-2 font-numero text-[28px] font-bold leading-[1.1] tracking-apertada text-texto">Vales-presente</h1>
      <p className="mt-1 max-w-2xl text-sm text-texto-suave">
        O cliente compra aqui (o dinheiro entra no caixa do dia) e recebe um código. Quando alguém usa, o caixa escolhe a forma
        <b> Vale-presente</b> e digita o código: a baixa sai do saldo, que pode ser usado aos poucos até a validade.
      </p>
      <ValesClient vales={vales} formas={formas} caixaAberto={!!cx} buscaInicial={sp.q ?? ""} />
    </div>
  );
}
