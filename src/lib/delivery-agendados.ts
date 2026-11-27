// Pedido AGENDADO não imprime ao aceitar (o papel ficaria horas na bancada).
// Antes, só imprimia quando alguém mudava pra "Em preparo" — e se ninguém
// lembrasse, não saía nunca (teste do Rafael, 27/11/2026). Agora a rotina
// /api/delivery/agendados (de 5 em 5 min) faz isso sozinha: quando faltam
// "tempo de preparo" minutos (Delivery → Config, padrão 40) pro horário marcado,
// o pedido aceito vai pra "Em preparo" e imprime na cozinha.
// Convênio (Kern) fica de fora: as marmitas saem por etiqueta, não pela comanda.
import { imprimirComandaDoPedido, type Db } from "@/lib/delivery-core";

const PADRAO_MIN = 40;
// Agendado que já passou faz tempo (sistema fora do ar, pedido esquecido) não
// imprime do nada: fica pra alguém olhar no painel.
const ATRASO_MAX_MIN = 120;

export async function prepararAgendados(db: Db) {
  const { data: cfgs } = await db.from("delivery_config").select("empresa_id, tempo_preparo_min");
  const agora = Date.now();
  let impressos = 0;
  const erros: string[] = [];
  for (const cfg of (cfgs as { empresa_id: string | null; tempo_preparo_min: number | null }[]) ?? []) {
    if (!cfg.empresa_id) continue;
    const min = Number(cfg.tempo_preparo_min) > 0 ? Number(cfg.tempo_preparo_min) : PADRAO_MIN;
    const ate = new Date(agora + min * 60000).toISOString();
    const desde = new Date(agora - ATRASO_MAX_MIN * 60000).toISOString();
    const { data: peds } = await db
      .from("delivery_pedidos")
      .select("id")
      .eq("empresa_id", cfg.empresa_id)
      .eq("status", "aceito")
      .neq("origem", "convenio")
      .not("agendado_para", "is", null)
      .lte("agendado_para", ate)
      .gte("agendado_para", desde)
      .limit(50);
    for (const p of (peds as { id: string }[]) ?? []) {
      // Trava: só quem muda de "aceito" pra "em_preparo" imprime (duas rodadas
      // juntas, ou alguém mudando no painel ao mesmo tempo, não imprimem 2×).
      const { data: pegou } = await db
        .from("delivery_pedidos")
        .update({ status: "em_preparo", preparo_em: new Date().toISOString() })
        .eq("id", p.id)
        .eq("status", "aceito")
        .select("id");
      if (!pegou || pegou.length === 0) continue;
      try {
        await imprimirComandaDoPedido(db, p.id);
        impressos++;
      } catch (e) {
        erros.push(`${p.id}: ${e instanceof Error ? e.message : "falha ao imprimir"}`);
      }
    }
  }
  return { impressos, erros };
}
