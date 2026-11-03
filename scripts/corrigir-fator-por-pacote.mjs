// BUG-004 da auditoria (03/11/2026): 17 produtos contados por caixa/pacote
// fechado estavam com o fator da nota em peças (1 caixa × 100 luvas), o que
// inflava o consumo e deixava o preço de referência no preço da peça.
// Confirmado pelo Rafael: a contagem é por caixa/pacote; o guardanapo é por
// pacote, 12 na caixa. O valor em R$ das notas não muda.
//
// Uso: node scripts/corrigir-fator-por-pacote.mjs            (só mostra)
//      node scripts/corrigir-fator-por-pacote.mjs --commit   (grava)
import pg from "pg";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { recalcularDivergencias } from "../src/lib/conferencia-core.ts";

dotenv.config({ path: ".env.local" });
const gravar = process.argv.includes("--commit");

const PRODUTOS = {
  "eb473e0c-05b8-47d5-a75f-8feb89eb135f": 1, // Canudo comum sachê
  "ea177a49-3b52-4222-9d33-155204220da3": 1, // Canudo mexedor sachê
  "7d5a08c2-3dcc-4c13-9524-3d4021adc1f4": 1, // Catchup sachê
  "4cc381ce-f615-4522-b172-e52b6532161e": 1, // Emb. plástica 30x39
  "1775e90f-8232-4435-b5e0-f2ee6a88eb36": 1, // Emb. plástica 50x71
  "c711840b-8a5b-4383-b4a0-33489cd5f121": 1, // Emb. plástica 34x50
  "03bff788-28d3-4db3-b87d-43c1d318e428": 12, // Guardanapo: 12 pacotes na caixa
  "06cf4f56-f33e-4481-9775-4f257a5542cb": 1, // Luva G
  "45fb7d90-f776-4a16-b774-0f8c7adee0ff": 1, // Luva GG
  "ef3f168a-5a5c-4001-a5a3-e818c74261bb": 1, // Luva M
  "9f064e57-3edd-4166-b055-df054fde3ed2": 1, // Maionese sachê
  "613a7873-0982-4f57-ad5d-a9c6ce72c18d": 1, // Palito
  "7469549b-16f9-4019-b77d-a9326a2e12c9": 1, // Pano não tecido
  "a71fee00-d596-4f98-b943-9b659da3f1f1": 1, // Pimenta sachê
  "4079bd0a-3c89-4e8e-83a8-9e2bda27500b": 1, // Saco de lixo 100 L
  "c37c11b9-10bb-4c57-82fd-813fc730383b": 1, // Saco de lixo 130 L
  "3c5022b6-2a7b-4e7e-8377-ac76617d5a3a": 1, // Sacola 48x58
};

const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
const pedidos = new Set();
let linhas = 0;
try {
  await db.query("begin");
  for (const [id, novo] of Object.entries(PRODUTOS)) {
    const { rows: [p] } = await db.query("select nome, preco_referencia from produtos where id = $1", [id]);
    // Linhas erradas: fator em peças (> 1); no guardanapo, tudo que não está em 12.
    const { rows: its } = await db.query(
      `update nota_itens ni set fator = $2 from notas_fiscais nf
       where nf.id = ni.nota_id and ni.produto_id = $1 and ni.fator <> $2 and ni.fator > case when $2 > 1 then 0 else 1 end
       returning nf.pedido_id`,
      [id, novo],
    );
    its.forEach((r) => r.pedido_id && pedidos.add(r.pedido_id));
    linhas += its.length;
    // Preço de referência = o da última nota lançada, na unidade da contagem.
    const { rows: [ult] } = await db.query(
      `select ni.valor_unit from nota_itens ni join notas_fiscais nf on nf.id = ni.nota_id
       where ni.produto_id = $1 and nf.situacao = 'lancada' and ni.destino is null and ni.valor_unit > 0
       order by nf.data_emissao desc limit 1`,
      [id],
    );
    const preco = ult ? Math.round((Number(ult.valor_unit) / novo) * 10000) / 10000 : null;
    if (preco != null) await db.query("update produtos set preco_referencia = $2 where id = $1", [id, preco]);
    console.log(`${p.nome}: ${its.length} linha(s) → ×${novo} | preço ref. ${p.preco_referencia} → ${preco}`);
  }
  console.log(`\nTotal: ${linhas} linhas de nota, ${pedidos.size} pedidos a recalcular`);
  await db.query(gravar ? "commit" : "rollback");
} catch (e) {
  await db.query("rollback");
  throw e;
}

if (gravar) {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  for (const pid of pedidos) {
    const { rows: [a] } = await db.query("select divergencias_n from pedidos where id = $1", [pid]);
    const r = await recalcularDivergencias(admin, pid);
    console.log(`pedido ${pid.slice(0, 8)}: divergências ${a.divergencias_n} → ${r.n}`);
  }
}
await db.end();
console.log(gravar ? "\nGravado." : "\nNada gravado (rode com --commit).");
