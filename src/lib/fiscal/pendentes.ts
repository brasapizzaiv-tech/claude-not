import { createAdminClient } from "@/lib/supabase/admin";
import { emitirNfceComandasAdmin, imprimirNfceAdmin } from "@/app/(painel)/salao/fiscal-actions";

// Fila da nota automática.
//
// Ao receber em Pix, cartão ou vale, a conta entra aqui em vez de emitir na
// hora: o caixa ganha alguns minutos pra digitar o CPF, se o cliente pedir, ou
// mandar emitir na hora. Passado o prazo, esta rotina emite sozinha (sem CPF) e
// manda o cupom pra impressora da nota.
//
// Quem chama: a rota que o agente de impressão consulta a cada 3 s. Assim não
// depende de ninguém estar com a tela do caixa aberta.

export type ResultadoFila = { emitidas: number; erros: number; verificadas: number };

// Trava contra emissão em dobro: a linha só é processada por quem conseguiu
// mudar o status de 'aguardando' para 'emitindo' (o banco resolve a disputa).
export async function processarNfcePendentes(): Promise<ResultadoFila> {
  const admin = createAdminClient();
  const agora = new Date().toISOString();

  const { data: vencidas } = await admin
    .from("nfce_pendentes")
    .select("id")
    .eq("status", "aguardando")
    .lte("emitir_em", agora)
    .order("emitir_em", { ascending: true })
    .limit(10);

  const ids = ((vencidas as { id: string }[]) ?? []).map((r) => r.id);
  if (ids.length === 0) return { emitidas: 0, erros: 0, verificadas: 0 };

  let emitidas = 0;
  let erros = 0;
  for (const id of ids) {
    const { data: presas } = await admin
      .from("nfce_pendentes")
      .update({ status: "emitindo" })
      .eq("id", id)
      .eq("status", "aguardando") // só passa quem chegou primeiro
      .select("id, comanda_ids, cpf_cnpj, tentativas");
    const linha = ((presas as { id: string; comanda_ids: string[]; cpf_cnpj: string | null; tentativas: number }[]) ?? [])[0];
    if (!linha) continue; // outra chamada pegou esta

    try {
      const r = await emitirNfceComandasAdmin(admin, linha.comanda_ids, linha.cpf_cnpj ?? "");
      if (r.ok) {
        await admin
          .from("nfce_pendentes")
          .update({ status: "emitida", nfce_id: (r as { id?: string }).id ?? null, erro: null, resolvido_em: new Date().toISOString() })
          .eq("id", linha.id);
        const nfceId = (r as { id?: string }).id;
        if (nfceId) await imprimirNfceAdmin(admin, nfceId);
        emitidas++;
      } else {
        erros++;
        const tent = (linha.tentativas ?? 0) + 1;
        // Tenta de novo daqui a 2 min, até 5 vezes; depois fica como "erro"
        // e aparece na tela do caixa pra alguém resolver.
        await admin
          .from("nfce_pendentes")
          .update({
            status: tent >= 5 ? "erro" : "aguardando",
            tentativas: tent,
            erro: (r as { mensagem?: string }).mensagem ?? "não autorizou",
            emitir_em: new Date(Date.now() + 120_000).toISOString(),
            resolvido_em: tent >= 5 ? new Date().toISOString() : null,
          })
          .eq("id", linha.id);
      }
    } catch (e) {
      erros++;
      const tent = (linha.tentativas ?? 0) + 1;
      await admin
        .from("nfce_pendentes")
        .update({
          status: tent >= 5 ? "erro" : "aguardando",
          tentativas: tent,
          erro: e instanceof Error ? e.message.slice(0, 300) : "falha",
          emitir_em: new Date(Date.now() + 120_000).toISOString(),
          resolvido_em: tent >= 5 ? new Date().toISOString() : null,
        })
        .eq("id", linha.id);
    }
  }

  return { emitidas, erros, verificadas: ids.length };
}
