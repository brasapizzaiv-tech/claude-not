// Gera a miniatura (400 px, WebP) das fotos do cardápio que ainda não têm
// (DES-006, migration 0304). Uma vez só, depois da migration; as fotos novas
// já ganham a miniatura no upload (src/lib/foto-miniatura.ts).
//
//   node scripts/gerar-miniaturas.mjs          → só mostra o que faria
//   node scripts/gerar-miniaturas.mjs --gravar → sobe as miniaturas e grava
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const path = require("node:path");
require("dotenv").config({ path: path.join(import.meta.dirname, "..", ".env.local"), quiet: true });
const sharp = require("sharp");
const { createClient } = require("@supabase/supabase-js");

const gravar = process.argv.includes("--gravar");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let antes = 0, depois = 0, feitas = 0, falhas = 0;
for (const [tabela, tipo] of [["pdv_itens", "item"], ["pdv_pizza_sabores", "sabor"]]) {
  const { data, error } = await db.from(tabela).select("id, foto_url, foto_mini_url").not("foto_url", "is", null).is("foto_mini_url", null).limit(1000);
  if (error) { console.error(tabela, error.message); process.exit(1); }
  for (const r of data ?? []) {
    try {
      const resp = await fetch(r.foto_url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const original = Buffer.from(await resp.arrayBuffer());
      const mini = await sharp(original).rotate().resize({ width: 400, withoutEnlargement: true }).webp({ quality: 72 }).toBuffer();
      antes += original.length; depois += mini.length;
      if (gravar) {
        const caminho = `${tipo}/${r.id}-mini.webp`;
        const up = await db.storage.from("cardapio").upload(caminho, mini, { contentType: "image/webp", upsert: true });
        if (up.error) throw new Error(up.error.message);
        const url = `${db.storage.from("cardapio").getPublicUrl(caminho).data.publicUrl}?v=${Date.now()}`;
        const u = await db.from(tabela).update({ foto_mini_url: url }).eq("id", r.id);
        if (u.error) throw new Error(u.error.message);
      }
      feitas++;
    } catch (e) {
      falhas++;
      console.log("falhou", tabela, r.id.slice(0, 8), e.message);
    }
  }
}
const kb = (n) => `${Math.round(n / 1024)} KB`;
console.log(`${gravar ? "gravadas" : "(teste) fariam"}: ${feitas} miniaturas, ${falhas} falhas · originais ${kb(antes)} → miniaturas ${kb(depois)}`);
