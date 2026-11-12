import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { conferirPixDoApp } from "@/lib/delivery-pix";
import { pixConfigurado } from "@/lib/pix";
import { rodarRotina } from "@/lib/saude";
import { cronAutorizado } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// DEL-02: confere os Pix do app de pedidos de 5 em 5 min (vercel.json) — o
// cliente que paga e fecha o navegador não deixa o pedido "não pago" — e lança
// no caixa os pagos que ficaram esperando o caixa abrir (DEL-01).
export async function GET(req: NextRequest) {
  if (!cronAutorizado(req)) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  return rodarRotina("rotina:delivery-pix", async () => {
    if (!pixConfigurado()) return { ok: true, detalhe: "Pix online não configurado", resposta: { ok: true } };
    const r = await conferirPixDoApp(createAdminClient());
    return { ok: true, detalhe: `${r.esperando} esperando, ${r.pagos} pago(s); ${r.lancados}/${r.semCaixa} lançado(s) no caixa`, resposta: { ok: true, ...r } };
  });
}
