// Busca das notas fiscais (caixa) NO BANCO, com os filtros da tela (DES-008,
// Onda 4). Antes a tela baixava as 1.000 mais recentes e filtrava ali — a
// busca nunca achava nota mais antiga, e cada abertura levava 1,2 s.
import type { createClient } from "@/lib/supabase/server";
import { buscarPorLotes } from "@/lib/supabase/todas";
import type { NotaLinha } from "./notas-client";

type Db = Awaited<ReturnType<typeof createClient>>;

export type FiltroNotas = { q?: string; status?: string; modelo?: string };

export const POR_PAGINA = 100;

const CAMPOS = "id, modelo, ambiente, status, numero, serie, chave, url_danfe, url_xml, valor, mensagem, criado_em, comanda_ids, pdv_comandas(numero)";

/** A consulta com os filtros, pronta pra paginar. Vem dentro de { q }: devolver
 *  o construtor direto de uma função async faria o await RODAR a consulta. */
async function montar(db: Db, f: FiltroNotas) {
  let q = db.from("nfce_emitidas").select(CAMPOS, { count: "exact" });
  if (f.status === "autorizado" || f.status === "cancelado") q = q.eq("status", f.status);
  else if (f.status === "erro") q = q.or("status.is.null,status.not.in.(autorizado,cancelado)");
  if (f.modelo === "nfce" || f.modelo === "nfe") q = q.eq("modelo", f.modelo);
  const t = (f.q ?? "").trim().replace(/[,()*%]/g, " ").trim();
  if (t) {
    const ors: string[] = [];
    if (/^\d+$/.test(t)) {
      // Número: da nota, ou da comanda (que mora em outra tabela).
      ors.push(`numero.eq.${t}`);
      const { data: coms } = await db.from("pdv_comandas").select("id").eq("numero", Number(t)).order("aberta_em", { ascending: false }).limit(50);
      const ids = ((coms as { id: string }[] | null) ?? []).map((c) => c.id);
      if (ids.length) ors.push(`comanda_id.in.(${ids.join(",")})`, `comanda_ids.ov.{${ids.join(",")}}`);
      if (t.length >= 6) ors.push(`chave.ilike.*${t}*`);
    } else {
      ors.push(`chave.ilike.*${t}*`, `mensagem.ilike.*${t}*`);
    }
    q = q.or(ors.join(","));
  }
  return { q: q.order("criado_em", { ascending: false }).order("id") };
}

/** Uma página da lista, já com os números das comandas. */
export async function consultarNotas(db: Db, f: FiltroNotas, pagina: number, porPagina = POR_PAGINA) {
  const de = Math.max(0, pagina) * porPagina;
  const { data, count } = await (await montar(db, f)).q.range(de, de + porPagina - 1);
  const rows = (data as unknown as Record<string, unknown>[]) ?? [];
  // Nota de várias comandas: busca os números de todas (em lotes — a lista de
  // ids vai no endereço da consulta, que tem tamanho máximo).
  const todosIds = [...new Set(rows.flatMap((r) => (r.comanda_ids as string[] | null) ?? []))];
  const numeroDe = new Map<string, number>();
  const cs = await buscarPorLotes<{ id: string; numero: number }>(todosIds, (lote) =>
    db.from("pdv_comandas").select("id, numero").in("id", lote),
  );
  for (const c of cs) numeroDe.set(c.id, c.numero);
  const linhas: NotaLinha[] = rows.map((r) => ({
    id: r.id as string,
    modelo: (r.modelo as string) || "",
    ambiente: (r.ambiente as string) || "",
    status: (r.status as string) || "",
    numero: (r.numero as string) || null,
    serie: (r.serie as string) || null,
    chave: (r.chave as string) || null,
    urlDanfe: (r.url_danfe as string) || null,
    urlXml: (r.url_xml as string) || null,
    valor: r.valor != null ? Number(r.valor) : null,
    mensagem: (r.mensagem as string) || null,
    criadoEm: (r.criado_em as string) || null,
    comandaNumero: (r.pdv_comandas as { numero?: number } | null)?.numero ?? null,
    comandas: ((r.comanda_ids as string[] | null) ?? []).map((id) => numeroDe.get(id)).filter((n): n is number => n != null),
  }));
  return { linhas, total: count ?? linhas.length };
}
