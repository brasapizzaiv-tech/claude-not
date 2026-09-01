import { createAdminClient } from "@/lib/supabase/admin";
import { agenteAutorizado } from "@/lib/impressao-agente";

export const runtime = "nodejs";

// Cria a comanda de buffet a partir de uma pesagem vinda do AGENTE da balança
// (inclusive as represadas da fila offline — o `ts` preserva o horário real).
// Mesma regra do quiosque: preço por dia da semana, teto do livre, marmita só-kg.
export async function POST(req: Request) {
  if (!(await agenteAutorizado(req))) return new Response("nao autorizado", { status: 401 });

  let body: { peso?: number; tara_balanca?: number; so_kg?: boolean; livre_direto?: boolean; ts?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, erro: "body inválido" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: cfgRows } = await admin.from("pdv_config").select("chave, valor");
  const cfg: Record<string, string> = {};
  for (const r of (cfgRows as { chave: string; valor: string }[]) ?? []) cfg[r.chave] = r.valor;

  // Preço do dia (fuso de Brasília) — usa o dia da PESAGEM (ts), não o do sync.
  const quando = body.ts && !isNaN(new Date(body.ts).getTime()) ? new Date(body.ts) : new Date();
  const dow = new Date(quando.getTime() - 3 * 3600 * 1000).getUTCDay();
  const kgDia = cfg[`preco_kg_${dow}`];
  const livreDia = cfg[`buffet_livre_${dow}`];
  const precoKg = kgDia != null && kgDia !== "" ? Number(kgDia) : Number(cfg.preco_kg || 0);
  const livrePreco = livreDia != null && livreDia !== "" ? Number(livreDia) : Number(cfg.buffet_livre || 0);

  let peso = 0, tara = 0, liquido = 0, valor = 0, livre = false, soKg = false;

  if (body.livre_direto) {
    if (!(livrePreco > 0)) return Response.json({ ok: false, erro: "preço do livre não configurado" }, { status: 422 });
    valor = livrePreco;
    livre = true;
  } else {
    peso = Number(body.peso) || 0;
    if (!(peso > 0)) return Response.json({ ok: false, erro: "peso inválido" }, { status: 422 });
    const taraBalanca = Number(body.tara_balanca) || 0;
    soKg = !!body.so_kg;
    // Se tarou NA balança, o peso já vem líquido.
    tara = taraBalanca > 0.001 ? 0 : Number(cfg.tara_padrao || 0);
    liquido = Math.max(0, peso - tara);
    valor = liquido * precoKg;
    if (!soKg && livrePreco > 0 && valor >= livrePreco) {
      valor = livrePreco;
      livre = true;
    }
    valor = Math.round(valor * 100) / 100;
    tara = taraBalanca > 0.001 ? taraBalanca : tara;
  }

  const { data: com, error } = await admin
    .from("pdv_comandas")
    .insert({
      peso,
      tara,
      valor_buffet: valor,
      livre,
      mesa: "Balança",
      so_kg: soKg,
      aberta_em: quando.toISOString(),
    })
    .select("id, numero")
    .single();
  if (error || !com) return Response.json({ ok: false, erro: error?.message ?? "falha ao criar" }, { status: 500 });

  return Response.json({
    ok: true,
    id: com.id,
    numero: com.numero,
    valor,
    liquido: Math.round(liquido * 1000) / 1000,
    peso,
    tara,
    livre,
  });
}
