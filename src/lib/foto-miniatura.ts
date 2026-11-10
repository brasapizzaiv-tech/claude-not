// Miniatura da foto do cardápio (DES-006, migration 0304): 400 px de largura,
// WebP ~20 KB, pro app do cliente não baixar a foto original em cada cartão.
// Feita no servidor com o sharp (vem com o Next). Se falhar, devolve null e a
// tela continua com a foto grande — miniatura nunca impede salvar a foto.
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

export const LARGURA_MINI = 400;

/** Gera e sobe a miniatura em `{tipo}/{id}-mini.webp`. Devolve a URL pública (com ?v=) ou null. */
export async function subirMiniatura(admin: Admin, tipo: "item" | "sabor", id: string, original: Buffer): Promise<string | null> {
  try {
    const sharp = (await import("sharp")).default;
    const mini = await sharp(original).rotate().resize({ width: LARGURA_MINI, withoutEnlargement: true }).webp({ quality: 72 }).toBuffer();
    const caminho = `${tipo}/${id}-mini.webp`;
    const { error } = await admin.storage.from("cardapio").upload(caminho, mini, { contentType: "image/webp", upsert: true });
    if (error) return null;
    const { data } = admin.storage.from("cardapio").getPublicUrl(caminho);
    return `${data.publicUrl}?v=${Date.now()}`;
  } catch {
    return null;
  }
}
