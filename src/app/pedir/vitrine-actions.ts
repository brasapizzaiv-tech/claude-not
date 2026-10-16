"use server";

// Ações públicas da Vitrine do app (/pedir), sem login. Só gravam contagem e o
// carrinho largado — nada de dinheiro. Tudo filtrado pela empresa do endereço.
import { createAdminClient } from "@/lib/supabase/admin";
import { empresaAtualId } from "@/lib/empresa";

const SESSAO = /^[a-z0-9]{16,40}$/;

/** Conta "abriu o app", "chegou ao carrinho", "viu um cupom" (uma vez por sessão e dia). */
export async function registrarEventoVitrine(sessao: string, tipo: "abriu" | "carrinho" | "cupom_mostrado", detalhe?: string | null) {
  if (!SESSAO.test(sessao || "") || !["abriu", "carrinho", "cupom_mostrado"].includes(tipo)) return;
  const empresaId = await empresaAtualId();
  if (!empresaId) return;
  // upsert com ignoreDuplicates: a mesma sessão no mesmo dia conta uma vez.
  await createAdminClient()
    .from("vitrine_eventos")
    .upsert({ empresa_id: empresaId, sessao, tipo, detalhe: (detalhe || "").slice(0, 40) || null }, { onConflict: "empresa_id,sessao,tipo,dia", ignoreDuplicates: true });
}

/** Carrinho montado com telefone e ainda não fechado (base do WhatsApp de carrinho abandonado). */
export async function salvarCarrinhoPublico(telefone: string, resumo: string, total: number) {
  const fone = (telefone || "").replace(/\D/g, "");
  if (fone.length < 10 || fone.length > 13) return;
  const empresaId = await empresaAtualId();
  if (!empresaId) return;
  const admin = createAdminClient();
  const { data: cli } = await admin.from("clientes").select("id").eq("empresa_id", empresaId).ilike("telefone", `%${fone.slice(-10)}%`).limit(1).maybeSingle();
  await admin.from("vitrine_carrinhos").upsert({
    empresa_id: empresaId,
    telefone: fone,
    cliente_id: (cli as { id: string } | null)?.id ?? null,
    resumo: (resumo || "").slice(0, 300),
    total: Math.max(0, Math.round(Number(total || 0) * 100) / 100),
    atualizado_em: new Date().toISOString(),
    fechado_em: null,
  }, { onConflict: "empresa_id,telefone" });
}
