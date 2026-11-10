import { createAdminClient } from "@/lib/supabase/admin";
import { empresaDoAgente } from "@/lib/impressao-agente";
import { processarNfcePendentes } from "@/lib/fiscal/pendentes";
import { registrarErro } from "@/lib/saude";

// Depois de 5 falhas o item para de ser entregue e aparece na Saúde do sistema
// (AGT-05). Comanda de cozinha com mais de 1 hora fica retida (AGT-02): sair
// horas depois, na cozinha, só confunde.
const MAX_TENTATIVAS = 5;
const COMANDA_VELHA_MS = 60 * 60 * 1000;

// Lista os documentos pendentes de impressão (fila genérica) para o agente.
// Cada item entregue fica RESERVADO por 90 s (entregue_em): se dois agentes
// estiverem rodando, o segundo não pega o mesmo item — acabou a impressão em
// dobro. Se o agente cair antes de dar baixa, o item volta depois dos 90 s.
function orientacaoDe(tipo: string, imp: { etiqueta_config: { largura?: number; altura?: number } | null } | null | undefined): "portrait" | "landscape" {
  if (!["etiqueta", "marmita", "teste_etiqueta"].includes(tipo)) return "portrait";
  const c = imp?.etiqueta_config;
  const largura = Number(c?.largura) || 55, altura = Number(c?.altura) || 55;
  return largura > altura ? "landscape" : "portrait";
}

let ultimaNfce = 0;

export async function GET(req: Request) {
  // O token do agente diz de qual loja é este PC — e é o que impede um
  // restaurante de imprimir a comanda do outro na cozinha.
  const empresaId = await empresaDoAgente(req);
  if (!empresaId) return new Response("nao autorizado", { status: 401 });

  // O agente consulta esta rota a cada 3 s — é o "relógio" do sistema. Aqui
  // também saem as notas automáticas cujo prazo de espera venceu (ninguém
  // precisa estar com a tela do caixa aberta).
  // Notas automáticas: no máximo uma checagem a cada 30 s, não a cada consulta
  // do agente (que chegava a 3 s). A fila de notas já espera N minutos mesmo.
  if (Date.now() - ultimaNfce > 30_000) {
    ultimaNfce = Date.now();
    try { await processarNfcePendentes(); } catch (e) {
      // Nota não pode travar a impressão, mas fica o rastro (COD-004).
      await registrarErro("impressao:fila:nfce-pendentes", e, null, empresaId);
    }
  }

  const admin = createAdminClient();
  const limite = new Date(Date.now() - 90_000).toISOString();
  const { data, error: eFila } = await admin
    .from("impressao_fila")
    .select("id, tipo, solicitado_em, liberado_em, impressoras(nome, impressora_windows, etiqueta_config)")
    .eq("empresa_id", empresaId)
    .is("impresso_em", null)
    .is("descartado_em", null)
    .is("retido_em", null)
    .lt("tentativas", MAX_TENTATIVAS)
    .or(`entregue_em.is.null,entregue_em.lt.${limite}`)
    .order("solicitado_em", { ascending: true })
    .limit(50);

  if (eFila) {
    await registrarErro("impressao:fila", eFila.message, null, empresaId);
    return Response.json({ jobs: [], erro: "fila indisponível" }, { status: 500 });
  }

  type Imp = { nome: string; impressora_windows: string | null; etiqueta_config: { largura?: number; altura?: number } | null };
  type Row = { id: string; tipo: string; solicitado_em: string | null; liberado_em: string | null; impressoras: Imp | Imp[] | null };
  const todas = (data as unknown as Row[]) ?? [];
  const velhaAntes = Date.now() - COMANDA_VELHA_MS;
  const retidas = todas.filter((e) => e.tipo === "comanda" && !e.liberado_em && e.solicitado_em && new Date(e.solicitado_em).getTime() < velhaAntes);
  if (retidas.length > 0) {
    await admin.from("impressao_fila").update({ retido_em: new Date().toISOString() }).in("id", retidas.map((e) => e.id));
  }
  const retidaIds = new Set(retidas.map((e) => e.id));
  const jobs = todas.filter((e) => !retidaIds.has(e.id)).map((e) => {
    const imp = Array.isArray(e.impressoras) ? e.impressoras[0] : e.impressoras;
    return {
      id: e.id,
      tipo: e.tipo,
      impressora: imp?.nome ?? null,
      printer: imp?.impressora_windows ?? null,
      url: `/api/impressao/documento/${e.id}`,
      // Todo documento que o sistema gera já sai na medida da impressora, então
      // imprime 1:1. Quem manda é o servidor: assim dá pra ajustar sem trocar o
      // agente de novo (o agente antigo ignora e usa o padrão dele).
      escala: "noscale" as const,
      // O SumatraPDF (que o agente usa) gira TODA página mais larga que alta,
      // e só desgira se receber "landscape". A etiqueta 100×70 da Elgin saía
      // de lado por isso (02/10/2026). Então a orientação da etiqueta é a do
      // formato cadastrado na impressora; o agente 1.1.5+ repassa pra ele.
      orientacao: orientacaoDe(e.tipo, imp),
      // Cupom da NFC-e sai em ESC/POS (fonte da própria térmica, nítida como
      // o cupom da balança). O agente 1.1.4+ pede "?formato=escpos" e manda os
      // bytes crus pro spooler; o agente antigo ignora e imprime o PDF.
      // O comprovante do cartão (tef) também: pelo PDF saía cinza (08/10/2026).
      formato: e.tipo === "nfce" || e.tipo === "tef" || e.tipo === "vale" ? ("escpos" as const) : ("pdf" as const),
    };
  });
  if (jobs.length > 0) {
    await admin.from("impressao_fila").update({ entregue_em: new Date().toISOString() }).in("id", jobs.map((j) => j.id));
  }
  return Response.json({ jobs });
}
