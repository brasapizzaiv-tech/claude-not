import type { SupabaseClient } from "@supabase/supabase-js";
import { consultarNfce, consultarNfe, type FocusAmbiente } from "./focus";
import { TEXTO_CONTINGENCIA_OK, interpretarConsulta } from "./interpretar-consulta";

// Conferência das notas depois de emitidas (NFE-01, FIS-01, NFE-07).
//
// A nota pode sair do sistema num estado que ainda não é o final:
//   • "enviando": a tentativa foi registrada e a função caiu antes da resposta;
//   • "processando_autorizacao": a SEFAZ não respondeu na hora;
//   • autorizada em CONTINGÊNCIA OFFLINE: a Focus emite sem a SEFAZ e transmite
//     depois — se a SEFAZ recusar, a nota que o cliente levou não vale;
//   • "cancelando": o cancelamento ficou em processamento.
// Antes o sistema gravava a primeira resposta e nunca mais olhava. Aqui se
// pergunta à Focus como a nota está e grava o que ela disser.

export type LinhaNota = {
  id: string;
  ref: string;
  status: string;
  mensagem: string | null;
  modelo: string | null;
  ambiente: string | null;
  empresa_id: string | null;
  fiado_id?: string | null;
  mov_id?: string | null;
};
export type TokenFocus = { token: string; ambiente: FocusAmbiente };

/** Token certo pra nota (nota de homologação feita com o caixa em produção usa o de homologação). */
export function tokenDaNota(cfg: Record<string, string>, ambienteNota: string | null): TokenFocus | null {
  const amb = (ambienteNota as FocusAmbiente) || "homologacao";
  const token = amb === "homologacao" && (cfg.emissor_ambiente || "homologacao") !== "homologacao" ? cfg.emissor_token_homologacao : cfg.emissor_token;
  return token ? { token, ambiente: amb } : null;
}

export { TEXTO_CONTINGENCIA_OK, interpretarConsulta };

/**
 * Pergunta à Focus como a nota está e grava. Devolve o status gravado, ou null
 * se a Focus não respondeu (aí nada muda e a próxima rodada tenta de novo).
 */
export async function atualizarPelaFocus(
  db: SupabaseClient,
  n: LinhaNota,
  cfg: TokenFocus,
): Promise<{ status: string; numero?: string; chave?: string; urlDanfe?: string } | null> {
  const consultar = n.modelo === "nfe" ? consultarNfe : consultarNfce;
  const c = await consultar(cfg, n.ref);
  const agora = new Date().toISOString();
  if (c.statusHttp === 0) return null;
  if (c.statusHttp === 404) {
    // A Focus não conhece a ref: a tentativa não chegou lá. Só a "enviando" vira
    // erro (as outras já tiveram resposta da Focus antes, então é só anotar).
    const status = n.status === "enviando" ? "erro" : n.status;
    await db.from("nfce_emitidas").update({
      status,
      mensagem: n.status === "enviando" ? "A emissão não chegou à Focus (a conexão caiu antes). Pode emitir de novo." : n.mensagem,
      conferida_em: agora,
    }).eq("id", n.id);
    return { status };
  }
  if (!c.status) {
    await db.from("nfce_emitidas").update({ conferida_em: agora }).eq("id", n.id);
    return null;
  }

  const { status, mensagem } = interpretarConsulta(n, c);
  await db.from("nfce_emitidas").update({
    status,
    mensagem,
    conferida_em: agora,
    ...(c.numero ? { numero: c.numero } : {}),
    ...(c.chave ? { chave: c.chave } : {}),
    ...(c.urlDanfe ? { url_danfe: c.urlDanfe } : {}),
    ...(c.urlXml ? { url_xml: c.urlXml } : {}),
  }).eq("id", n.id);
  return { status, numero: c.numero, chave: c.chave, urlDanfe: c.urlDanfe };
}

/**
 * Uma rodada da conferência (rotina de 30 em 30 min). Pega no máximo `limite`
 * notas por vez, as que esperam há mais tempo primeiro.
 */
export async function conferirNotasPendentes(admin: SupabaseClient, limite = 20) {
  const campos = "id, ref, status, mensagem, modelo, ambiente, empresa_id, fiado_id, mov_id";
  const cincoMin = new Date(Date.now() - 5 * 60_000).toISOString();
  const seisHoras = new Date(Date.now() - 6 * 3600_000).toISOString();
  const [andamento, enviando, contingencia] = await Promise.all([
    admin.from("nfce_emitidas").select(campos).in("status", ["processando_autorizacao", "cancelando"]).order("criado_em").limit(limite),
    admin.from("nfce_emitidas").select(campos).eq("status", "enviando").lt("criado_em", cincoMin).order("criado_em").limit(limite),
    admin.from("nfce_emitidas").select(campos)
      .eq("status", "autorizado")
      .ilike("mensagem", "%contingência offline%")
      .not("mensagem", "ilike", `%${TEXTO_CONTINGENCIA_OK}%`)
      .or(`conferida_em.is.null,conferida_em.lt.${seisHoras}`)
      .order("conferida_em", { ascending: true, nullsFirst: true })
      .limit(limite),
  ]);
  const notas = [...(andamento.data ?? []), ...(enviando.data ?? []), ...(contingencia.data ?? [])].slice(0, limite) as LinhaNota[];

  const cfgs = new Map<string, Record<string, string>>();
  const resultado: Record<string, number> = {};
  for (const n of notas) {
    if (!n.empresa_id || !n.ref) continue;
    if (!cfgs.has(n.empresa_id)) {
      const { data } = await admin.from("config_fiscal").select("chave, valor").eq("empresa_id", n.empresa_id);
      cfgs.set(n.empresa_id, Object.fromEntries(((data as { chave: string; valor: string | null }[]) ?? []).map((r) => [r.chave, r.valor ?? ""])));
    }
    const tk = tokenDaNota(cfgs.get(n.empresa_id)!, n.ambiente);
    if (!tk) continue;
    const r = await atualizarPelaFocus(admin, n, tk);
    const k = r ? `${n.status}→${r.status}` : `${n.status}→sem resposta`;
    resultado[k] = (resultado[k] ?? 0) + 1;
  }
  return { conferidas: notas.length, resultado };
}
