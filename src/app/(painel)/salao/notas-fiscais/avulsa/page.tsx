import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { empresaAtualId } from "@/lib/empresa";
import { exigirAcesso } from "@/lib/permissoes-server";
import { listarFormas } from "@/lib/formas-pagamento-server";
import { AvulsaClient, type ItemCardapio, type PerfilOpcao } from "./avulsa-client";

export const metadata = { title: "Nota avulsa · Notas fiscais" };
export const dynamic = "force-dynamic";

// Nota fiscal AVULSA (migration 0248): NF-e (55) pra empresa com CNPJ — Kern e
// outras — e NFC-e (65), montadas à mão, fora do caixa.
export default async function NotaAvulsaPage() {
  await exigirAcesso(["/salao", "/financeiro"]);
  const db = await createClient();
  // Só o ambiente e SE existe token de homologação (o valor nunca vai pra tela).
  const empresaId = await empresaAtualId();
  const [{ data: itens }, { data: perfis }, { data: cfgRows }] = await Promise.all([
    db.from("pdv_itens").select("id, nome, preco, categoria").eq("ativo", true).order("nome").limit(2000),
    db.from("perfis_fiscais").select("id, nome, cfop, csosn, ncm").eq("ativo", true).order("nome"),
    empresaId
      ? createAdminClient().from("config_fiscal").select("chave, valor").eq("empresa_id", empresaId).in("chave", ["emissor_ambiente", "emissor_token_homologacao"])
      : Promise.resolve({ data: [] }),
  ]);
  const cfg: Record<string, string> = {};
  for (const r of (cfgRows as { chave: string; valor: string | null }[]) ?? []) cfg[r.chave] = r.valor ?? "";
  const producao = cfg.emissor_ambiente === "producao";
  const podeTeste = !!cfg.emissor_token_homologacao || !producao;
  // Formas com que a nota pode entrar no caixa (sem saldo, equipe, cortesia e vale-presente).
  const formasCaixa = (await listarFormas("caixa"))
    .filter((f) => !["saldo", "equipe", "cortesia", "vale_presente"].includes(f.tipo))
    .map((f) => f.nome);

  return (
    <div className="pagina">
      <p className="rotulo">
        <Link href="/salao/notas-fiscais" className="hover:text-texto">Notas fiscais</Link>
      </p>
      <h1 className="mt-1 titulo-pagina">Nota avulsa</h1>
      <p className="mt-1 max-w-2xl text-sm text-texto-suave">
        NF-e pra empresa (Kern e outras) ou NFC-e pra consumidor, fora do caixa. Puxe o que o cliente comprou no período ou digite os itens.
      </p>
      <AvulsaClient
        itens={((itens as { id: string; nome: string; preco: number; categoria: string | null }[]) ?? []).map((i) => ({ ...i, preco: Number(i.preco) || 0 })) as ItemCardapio[]}
        perfis={(perfis as PerfilOpcao[]) ?? []}
        producao={producao}
        podeTeste={podeTeste}
        formasCaixa={formasCaixa}
      />
    </div>
  );
}
