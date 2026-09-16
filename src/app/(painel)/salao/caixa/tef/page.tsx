import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TefLista, type TefLinha } from "./tef-lista";

// Cartões passados no pinpad (TEF): reimprimir a via, cancelar uma venda e
// abrir o menu administrativo do gerenciador. Fica fora da tela de receber.
export const metadata = { title: "Cartões TEF · Brasa" };
export const dynamic = "force-dynamic";

// Fora do componente por causa da regra de pureza do React.
const seteDiasAtras = () => new Date(Date.now() - 7 * 86400000).toISOString();

export default async function TefPage() {
  const supabase = await createClient();
  const desde = seteDiasAtras();
  const { data } = await supabase
    .from("tef_transacoes")
    .select("id, tipo, valor, parcelas, rede, bandeira, nsu, autorizacao, status, mensagem, pan_mascarado, terminal, criado_em")
    .gte("criado_em", desde)
    .order("criado_em", { ascending: false })
    .limit(150);
  const linhas = (data as TefLinha[]) ?? [];

  return (
    <div className="p-4 md:p-6">
      <Link href="/salao/caixa" className="text-sm text-zinc-500 hover:text-orange-600">
        ← Voltar ao caixa
      </Link>
      <div className="mt-2 mb-4">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">💳 Cartões (TEF)</h1>
        <p className="text-sm text-zinc-500">
          Últimos 7 dias de cartões passados no pinpad. Aqui você reimprime a via do cliente, cancela uma venda (o pinpad pede o cartão de novo) e abre o menu administrativo da Elgin.
        </p>
      </div>
      <TefLista linhas={linhas} />
    </div>
  );
}
