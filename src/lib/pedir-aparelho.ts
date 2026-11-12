// SEC-08 / DEL-13: o app do cliente só mostra dados de um telefone (nome,
// endereço, pedidos, cashback) no APARELHO que já fez pedido com ele — e só
// depois que esse pedido foi ENTREGUE (um pedido falso com o telefone de outra
// pessoa não libera nada). Cookie só do servidor (httpOnly), guardado como
// hash em pedir_aparelhos (migration 0311). Usar só em ações do servidor.
import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import type { createAdminClient } from "@/lib/supabase/admin";
import { foneCandidatos, foneDigitos } from "@/lib/telefone";

type Admin = ReturnType<typeof createAdminClient>;
const COOKIE = "pedir_aparelho";
const hash = (t: string) => createHash("sha256").update(t).digest("hex");
type Linha = { id: string; confirmado: boolean; pedido_id: string | null };

/** Este aparelho já recebeu um pedido feito com este telefone? */
export async function aparelhoReconhece(db: Admin, empresaId: string, telefone: string): Promise<boolean> {
  const token = (await cookies()).get(COOKIE)?.value ?? "";
  if (!/^[0-9a-f]{64}$/.test(token)) return false;
  const cands = foneCandidatos(telefone);
  if (!cands.length) return false;
  const { data } = await db.from("pedir_aparelhos").select("id, confirmado, pedido_id")
    .eq("empresa_id", empresaId).eq("token_hash", hash(token)).in("telefone_digitos", cands);
  const linhas = (data as Linha[] | null) ?? [];
  let ok = linhas.find((l) => l.confirmado);
  if (!ok) {
    // Ainda não confirmado: vale assim que o pedido feito daqui foi entregue.
    const ids = linhas.map((l) => l.pedido_id).filter(Boolean) as string[];
    if (ids.length) {
      const { data: ent } = await db.from("delivery_pedidos").select("id")
        .in("id", ids).eq("empresa_id", empresaId).eq("status", "entregue").limit(1).maybeSingle();
      ok = ent ? linhas.find((l) => l.pedido_id === (ent as { id: string }).id) : undefined;
      if (ok) await db.from("pedir_aparelhos").update({ confirmado: true }).eq("id", ok.id);
    }
  }
  if (!ok) return false;
  await db.from("pedir_aparelhos").update({ usado_em: new Date().toISOString() }).eq("id", ok.id);
  return true;
}

/** Depois de um pedido aceito pelo servidor: liga este aparelho ao telefone (vale quando o pedido for entregue). */
export async function lembrarAparelho(db: Admin, empresaId: string, telefone: string, pedidoId: string): Promise<void> {
  const fone = foneDigitos(telefone);
  if (fone.length < 10) return;
  const jar = await cookies();
  let token = jar.get(COOKIE)?.value ?? "";
  if (!/^[0-9a-f]{64}$/.test(token)) {
    token = randomBytes(32).toString("hex");
    jar.set(COOKIE, token, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 400 * 86400 });
  }
  const th = hash(token);
  const { data: ja } = await db.from("pedir_aparelhos").select("id, confirmado")
    .eq("empresa_id", empresaId).eq("token_hash", th).eq("telefone_digitos", fone).maybeSingle();
  const linha = ja as { id: string; confirmado: boolean } | null;
  if (!linha) {
    await db.from("pedir_aparelhos").insert({ empresa_id: empresaId, token_hash: th, telefone_digitos: fone, pedido_id: pedidoId });
  } else if (!linha.confirmado) {
    // O pedido mais novo é o que confirma (o anterior pode ter sido cancelado).
    await db.from("pedir_aparelhos").update({ pedido_id: pedidoId, usado_em: new Date().toISOString() }).eq("id", linha.id);
  }
}
