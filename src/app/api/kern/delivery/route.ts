import { NextResponse, type NextRequest } from "next/server";
import { empresasKernAtivas, gerarPedidosKern } from "@/lib/kern-delivery";
import { rodarRotina } from "@/lib/saude";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Pedido de delivery da Kern: segunda a sábado às 08:35 de Brasília
// (vercel.json "35 11 * * 1-6", que é UTC). Os pedidos de marmita fecham às
// 08:30. Protegida pelo CRON_SECRET, igual às outras rotinas.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const key = req.nextUrl.searchParams.get("key");
  if (!secret || (auth !== `Bearer ${secret}` && key !== secret)) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }
  // Se a rotina do Kern não rodar, o delivery do dia não é criado: o sinal
  // aparece na Saúde do sistema e na tela inicial (MAR-05).
  return rodarRotina("rotina:kern", async () => {
    const dia = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    const saida: Record<string, unknown> = { dia };
    const falhas: string[] = [];
    for (const empresaId of await empresasKernAtivas()) {
      const r = await gerarPedidosKern(empresaId, dia);
      saida[empresaId] = r;
      if (!r.ok) falhas.push(r.mensagem ?? "falhou");
      // Filial que não virou pedido (erro ou cliente não escolhido) também é falha.
      for (const f of r.filiais ?? []) {
        if (f.acao === "erro" || f.acao === "sem_cliente") falhas.push(`${f.filial}: ${f.detalhe ?? f.acao}`);
      }
    }
    return { ok: falhas.length === 0, detalhe: falhas.length ? falhas.join(" · ") : `pedidos de ${dia} gerados`, resposta: saida };
  });
}
