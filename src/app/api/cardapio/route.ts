import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

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

  return NextResponse.json({
    tem: true,
    hoje: c.data === hoje,
    data: c.data,
    proteinas: linhas(c.proteinas),
    carboidratos: linhas(c.carboidratos),
    especial: linhas(c.especial),
    preco_livre: c.preco_livre,
    preco_kg: c.preco_kg,
  }, semCache);
}
