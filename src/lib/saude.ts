import { createAdminClient } from "@/lib/supabase/admin";

// Saúde do sistema (auditoria, Onda 2). Duas peças:
//
// - marcarSinal: cada rotina/peça grava o último sinal (deu certo ou não, e o
//   porquê). A tela /saude e os avisos leem daqui. Nunca deixa a rotina cair:
//   se a gravação falhar, só vai pro console.
// - registrarErro: o rastro do erro que o servidor engole de propósito (COD-004).
//   Grava em erros_sistema e no console.error. Não pôr dado pessoal no contexto.

export async function marcarSinal(
  chave: string,
  ok: boolean,
  detalhe?: string | null,
  empresaId?: string | null,
): Promise<void> {
  try {
    const agora = new Date().toISOString();
    const linha: Record<string, unknown> = {
      chave,
      empresa_id: empresaId ?? null,
      ok,
      detalhe: detalhe ? String(detalhe).slice(0, 500) : null,
      ultima_em: agora,
    };
    if (ok) linha.ultima_ok_em = agora;
    else linha.falha_em = agora;
    const { error } = await createAdminClient().from("saude_sinais").upsert(linha, { onConflict: "chave" });
    if (error) console.error("[saude] marcarSinal", chave, error.message);
  } catch (e) {
    console.error("[saude] marcarSinal", chave, e instanceof Error ? e.message : e);
  }
}

export function mensagemDe(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  try { return JSON.stringify(e); } catch { return String(e); }
}

export async function registrarErro(
  onde: string,
  erro: unknown,
  contexto?: Record<string, unknown> | null,
  empresaId?: string | null,
): Promise<void> {
  const mensagem = mensagemDe(erro).slice(0, 1000);
  console.error(`[erro] ${onde}: ${mensagem}`, contexto ?? "");
  try {
    await createAdminClient().from("erros_sistema").insert({
      onde: onde.slice(0, 120),
      mensagem,
      contexto: contexto ?? null,
      empresa_id: empresaId ?? null,
    });
  } catch { /* o console já tem */ }
}

// Envolve uma rotina automática (cron): marca o sinal com o resultado e, se
// estourar, registra o erro e devolve 500 (antes respondia 200 com o erro
// escondido no JSON, e ninguém via — MAR-05).
export async function rodarRotina<T>(
  chave: string,
  fn: () => Promise<{ ok: boolean; detalhe?: string; resposta: T }>,
): Promise<Response> {
  try {
    const r = await fn();
    await marcarSinal(chave, r.ok, r.detalhe ?? null);
    if (!r.ok) await registrarErro(chave, r.detalhe ?? "falhou");
    return Response.json(r.resposta, { status: r.ok ? 200 : 500 });
  } catch (e) {
    await marcarSinal(chave, false, mensagemDe(e));
    await registrarErro(chave, e);
    return Response.json({ ok: false, erro: "falhou" }, { status: 500 });
  }
}
