import { createClient } from "@/lib/supabase/server";
import { FORMAS_CAIXA, type FormaLinha } from "@/lib/caixa";
import { FechamentoForm } from "../fechamento-form";
import type { EntradaFechamento } from "../actions";

const s = (n: number | null | undefined) =>
  n ? String(n).replace(".", ",") : "";

function vazio(): EntradaFechamento {
  return {
    id: null,
    data: new Date().toISOString().slice(0, 10),
    venda_bruta: "",
    acrescimos: "",
    cancelados: "",
    descontos: "",
    fretes: "",
    fundo_caixa: "",
    recebimentos: "",
    creditos: "",
    pagamentos: "",
    fiado: "",
    quebra: "",
    observacao: "",
    formas: FORMAS_CAIXA.map((f) => ({ forma: f, pedidos: "", valor: "" })),
  };
}

export default async function NovoFechamentoPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  let inicial = vazio();

  if (id) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("fechamentos_caixa")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (data) {
      const r = data as Record<string, number | string | FormaLinha[] | null>;
      const formas = (r.formas as FormaLinha[]) ?? [];
      inicial = {
        id: id,
        data: r.data as string,
        venda_bruta: s(r.venda_bruta as number),
        acrescimos: s(r.acrescimos as number),
        cancelados: s(r.cancelados as number),
        descontos: s(r.descontos as number),
        fretes: s(r.fretes as number),
        fundo_caixa: s(r.fundo_caixa as number),
        recebimentos: s(r.recebimentos as number),
        creditos: s(r.creditos as number),
        pagamentos: s(r.pagamentos as number),
        fiado: s(r.fiado as number),
        quebra: s(r.quebra as number),
        observacao: (r.observacao as string) ?? "",
        formas: FORMAS_CAIXA.map((f) => {
          const l = formas.find((x) => x.forma === f);
          return {
            forma: f,
            pedidos: l?.pedidos ? String(l.pedidos) : "",
            valor: l?.valor ? s(l.valor) : "",
          };
        }),
      };
    }
  }

  return <FechamentoForm inicial={inicial} />;
}
