import Link from "next/link";
import { Icone } from "@/components/icone";
import { createAdminClient } from "@/lib/supabase/admin";
import { contarFaixas, faixaDe, faixaValida, hojeSP } from "@/lib/etiqueta-vencimentos";
import { PainelVencimentos } from "@/components/etiqueta-ui";
import { ListaVencimentos, type EtqVenc } from "./lista";

export const metadata = { title: "Vencimentos · Brasa" };

export default async function VencimentosColabPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ f?: string }>;
}) {
  const { token } = await params;
  const { f } = await searchParams;
  const faixa = faixaValida(f) ?? "hoje";
  const admin = createAdminClient();
  const { data: colab } = await admin
    .from("colaboradores")
    .select("nome, ativo, faz_etiquetas")
    .eq("token", token)
    .maybeSingle();

  if (!colab || !colab.ativo || !colab.faz_etiquetas) {
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <p className="text-texto-suave">Você não tem acesso a etiquetas.</p>
        <Link href={`/eu/${token}`} className="mt-3 inline-block text-sm text-orange-600">← Voltar</Link>
      </div>
    );
  }

  const { data: ativas } = await admin
    .from("etiquetas")
    .select("id, numero, produto_nome, categoria_nome, validade, conservacao, quantidade, unidade, colaborador_nome")
    .eq("status", "ativa")
    .order("validade", { ascending: true, nullsFirst: false })
    .limit(2000);
  const hoje = hojeSP();
  const todas = (ativas as EtqVenc[]) ?? [];
  const contagem = contarFaixas(todas, hoje);
  const lista = todas.filter((e) => faixaDe(e.validade, hoje) === faixa);
  const base = `/eu/${token}/etiqueta/vencimentos`;

  return (
    <div className="mx-auto min-h-screen max-w-md bg-superficie-suave p-4">
      <Link href={`/eu/${token}`} className="text-sm text-texto-suave">← Voltar</Link>
      <h1 className="mt-2 mb-3 text-xl font-bold text-texto"><Icone nome="agenda" tamanho={18} className="mr-2" /> Painel de vencimentos</h1>
      <PainelVencimentos contagem={contagem} base={base} ativo={faixa} />
      <ListaVencimentos token={token} lista={lista} hoje={hoje} />
    </div>
  );
}
