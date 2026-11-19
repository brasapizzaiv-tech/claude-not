import { createAdminClient } from "@/lib/supabase/admin";
import { perfilDaSessao, usuarioDaSessao } from "@/lib/sessao";
import { podeAcessar } from "@/lib/permissoes";
import { modulosDaEmpresa } from "@/lib/modulos-empresa";
import { ACOES, ACOES_SO_DONO, ACAO_VALIDADE_MIN } from "@/lib/ajudante/acoes";

// Ajudante, etapa 3: o clique em "Confirmar" ou "Cancelar" no cartão de uma
// ação que a IA preparou (ajudante_acoes, migration 0316). Só aqui a ação
// roda — e só para a mesma pessoa que pediu, dentro do prazo, uma vez.

export const runtime = "nodejs";
export const maxDuration = 60;

const POR_NOME = new Map(ACOES.map((a) => [a.nome, a]));

function resposta(status: number, corpo: { ok: boolean; mensagem: string; situacao?: string }) {
  return Response.json(corpo, { status });
}

function hojeBR() {
  return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

export async function POST(req: Request) {
  const { user } = await usuarioDaSessao();
  if (!user) return resposta(401, { ok: false, mensagem: "Entre no sistema de novo." });
  const perfil = await perfilDaSessao();
  const empresaId = perfil?.empresa_id;
  if (!perfil || !empresaId) return resposta(403, { ok: false, mensagem: "Seu login não está ligado a uma empresa." });
  const dono = perfil.papel === "dono";

  let id = "";
  let decisao = "";
  try {
    const b = (await req.json()) as { id?: unknown; decisao?: unknown };
    id = typeof b.id === "string" && /^[0-9a-f-]{36}$/i.test(b.id) ? b.id : "";
    decisao = b.decisao === "confirmar" || b.decisao === "cancelar" ? b.decisao : "";
  } catch {}
  if (!id || !decisao) return resposta(400, { ok: false, mensagem: "Pedido inválido." });

  const admin = createAdminClient();
  const { data: pedido, error } = await admin
    .from("ajudante_acoes")
    .select("id, acao, dados, status, criado_em, user_id, empresa_id")
    .eq("id", id)
    .eq("empresa_id", empresaId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return resposta(503, { ok: false, mensagem: "Não consegui conferir o pedido. Confira a internet e tente de novo." });
  if (!pedido) return resposta(404, { ok: false, mensagem: "Pedido não encontrado." });
  if (pedido.status !== "pendente") {
    return resposta(409, { ok: false, mensagem: "Esse pedido já foi decidido antes.", situacao: pedido.status });
  }

  const agora = new Date().toISOString();
  if (decisao === "cancelar") {
    await admin.from("ajudante_acoes").update({ status: "cancelada", decidido_em: agora }).eq("id", id).eq("status", "pendente");
    return resposta(200, { ok: true, mensagem: "Cancelado. Nada foi feito.", situacao: "cancelada" });
  }

  if (Date.now() - Date.parse(pedido.criado_em) > ACAO_VALIDADE_MIN * 60_000) {
    await admin.from("ajudante_acoes").update({ status: "vencida", decidido_em: agora }).eq("id", id).eq("status", "pendente");
    return resposta(410, { ok: false, mensagem: `Esse pedido passou de ${ACAO_VALIDADE_MIN} minutos e venceu. Peça de novo ao Ajudante.`, situacao: "vencida" });
  }

  const acao = POR_NOME.get(pedido.acao);
  if (!acao) return resposta(400, { ok: false, mensagem: "Essa ação não existe mais." });
  if (ACOES_SO_DONO && !dono && !acao.todos) return resposta(403, { ok: false, mensagem: "Por enquanto só o dono pode fazer essa ação pelo Ajudante." });
  const mods = await modulosDaEmpresa(perfil.empresa_id ?? null);
  if (!acao.telas.some((t) => podeAcessar(t, dono, perfil.permissoes ?? [], mods))) {
    return resposta(403, { ok: false, mensagem: "Seu login não pode fazer isso pela tela, então o Ajudante também não." });
  }

  // Trava: só um clique passa (o segundo encontra "executando" e para).
  const { data: pego } = await admin
    .from("ajudante_acoes")
    .update({ status: "executando", decidido_em: agora })
    .eq("id", id)
    .eq("status", "pendente")
    .select("id")
    .maybeSingle();
  if (!pego) return resposta(409, { ok: false, mensagem: "Esse pedido já está sendo feito." });

  try {
    const feito = await acao.executar((pedido.dados ?? {}) as Record<string, unknown>, { empresaId, hoje: hojeBR() });
    await admin.from("ajudante_acoes").update({ status: "feita", resultado: feito.slice(0, 500) }).eq("id", id);
    return resposta(200, { ok: true, mensagem: feito, situacao: "feita" });
  } catch (e) {
    // Next usa exceções pra redirect/notFound: não é erro da ação, mas aqui não deveria acontecer.
    const msg = e instanceof Error && e.message && !e.message.startsWith("NEXT_") && e.message.length < 300 ? e.message : "Não deu certo. Confira na tela e tente de novo.";
    await admin.from("ajudante_acoes").update({ status: "erro", resultado: msg }).eq("id", id);
    return resposta(200, { ok: false, mensagem: msg, situacao: "erro" });
  }
}
