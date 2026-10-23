import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { empresaAtualId } from "@/lib/empresa";
import { precosBuffet, type Db } from "@/lib/cardapio-dia-core";

// Cardápio do dia para o site público (a página é estática, então quem lê o
// banco é o servidor). Devolve o de hoje; se hoje ainda não foi publicado,
// devolve o próximo dia já publicado, para o site avisar quando sai.
export const dynamic = "force-dynamic";

// O cardápio muda todo dia: nada de cache no navegador.
const semCache = { headers: { "Cache-Control": "no-store, must-revalidate" } };

function hojeBR() {
  return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}
const linhas = (t: string | null) =>
  (t ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

export async function GET() {
  const hoje = hojeBR();
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("cardapio_dia")
    .select("data, proteinas, carboidratos, especial, preco_livre, preco_kg")
    .eq("publicado", true)
    .gte("data", hoje)
    .order("data")
    .limit(1);

  const c = (data ?? [])[0] as
    | {
        data: string;
        proteinas: string | null;
        carboidratos: string | null;
        especial: string | null;
        preco_livre: number | null;
        preco_kg: number | null;
      }
    | undefined;

  if (!c) return NextResponse.json({ tem: false }, semCache);

  // Preço = o que a balança e o caixa cobram nesse dia da semana (o gravado no
  // cardápio só vale se a tabela não tiver o dia).
  const tabela = await precosBuffet(supabase as unknown as Db, await empresaAtualId().catch(() => null)).catch(() => null);
  const dow = new Date(`${c.data}T12:00:00-03:00`).getUTCDay();
  const p = tabela?.[dow];

  return NextResponse.json({
    tem: true,
    hoje: c.data === hoje,
    data: c.data,
    proteinas: linhas(c.proteinas),
    carboidratos: linhas(c.carboidratos),
    especial: linhas(c.especial),
    preco_livre: p?.livre ?? c.preco_livre,
    preco_kg: p?.kg ?? c.preco_kg,
  }, semCache);
}
