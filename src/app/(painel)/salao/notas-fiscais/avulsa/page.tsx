import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { exigirAcesso } from "@/lib/permissoes-server";
import { AvulsaClient, type ItemCardapio, type PerfilOpcao } from "./avulsa-client";

export const metadata = { title: "Nota avulsa · Notas fiscais" };
export const dynamic = "force-dynamic";

// Nota fiscal AVULSA (migration 0248): NF-e (55) pra empresa com CNPJ — Kern e
// outras — e NFC-e (65), montadas à mão, fora do caixa.
export default async function NotaAvulsaPage() {
  await exigirAcesso(["/salao", "/financeiro"]);
  const db = await createClient();
  const [{ data: itens }, { data: perfis }, { data: cfgRows }] = await Promise.all([
    db.from("pdv_itens").select("id, nome, preco, categoria").eq("ativo", true).order("nome").limit(2000),
    db.from("perfis_fiscais").select("id, nome, cfop, csosn, ncm").eq("ativo", true).order("nome"),
    db.from("config_fiscal").select("chave, valor"),
  ]);
  const cfg: Record<string, string> = {};
  for (const r of (cfgRows as { chave: string; valor: string | null }[]) ?? []) cfg[r.chave] = r.valor ?? "";
  const producao = cfg.emissor_ambiente === "producao";
  const podeTeste = !!cfg.emissor_token_homologacao || !producao;

  return (
    <div className="w-full px-4 py-5 md:px-[30px] md:py-[26px]">
      <p className="rotulo">
        <Link href="/salao/notas-fiscais" className="hover:text-texto">Notas fiscais</Link>
      </p>
      <h1 className="mt-1 font-numero text-[30px] font-bold leading-[1.05] tracking-apertada text-texto">Nota avulsa</h1>
      <p className="mt-1 max-w-2xl text-sm text-texto-suave">
        NF-e pra empresa (Kern e outras) ou NFC-e pra consumidor, fora do caixa. Puxe o que o cliente comprou no período ou digite os itens.
      </p>
      <AvulsaClient
        itens={((itens as { id: string; nome: string; preco: number; categoria: string | null }[]) ?? []).map((i) => ({ ...i, preco: Number(i.preco) || 0 })) as ItemCardapio[]}
        perfis={(perfis as PerfilOpcao[]) ?? []}
        producao={producao}
        podeTeste={podeTeste}
      />
    </div>
  );
}
