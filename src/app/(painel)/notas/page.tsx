import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { UploadNota } from "./upload";
import { BuscarNotas } from "./buscar-notas";
import { ManifestarLote } from "./manifestar-lote";
import { NotasLista, type NotaLinha } from "./notas-lista";

export default async function NotasPage() {
  const supabase = await createClient();
  const [{ data }, { data: cfg }] = await Promise.all([
    supabase
      .from("notas_fiscais")
      .select(
        "id, numero, emit_nome, valor, data_emissao, vencimento, situacao, manifestado_em",
      )
      .order("data_emissao", { ascending: false })
      .limit(300),
    supabase.from("config_sefaz").select("bloqueado_ate").limit(1).maybeSingle(),
  ]);
  const bloqueadoAte = (cfg as { bloqueado_ate?: string | null } | null)?.bloqueado_ate ?? null;

  type Nota = {
    id: string;
    numero: string | null;
    emit_nome: string | null;
    valor: number;
    data_emissao: string | null;
    vencimento: string | null;
    situacao: string;
    manifestado_em: string | null;
  };
  const notas = (data as Nota[]) ?? [];

  // Checa itens das notas manifestadas ou pendentes (poucas) para saber quais
  // ainda estão em resumo (sem itens).
  const alvos = notas
    .filter((n) => n.manifestado_em || n.situacao === "pendente")
    .map((n) => n.id);
  const comItens = new Set<string>();
  if (alvos.length > 0) {
    const { data: itens } = await supabase
      .from("nota_itens")
      .select("nota_id")
      .in("nota_id", alvos);
    for (const i of (itens as { nota_id: string }[]) ?? [])
      comItens.add(i.nota_id);
  }
  // Só "aguardando itens" nas pendentes — uma nota já lançada está pronta.
  const aguardando = (n: Nota) =>
    n.situacao === "pendente" && !!n.manifestado_em && !comItens.has(n.id);
  // Notas em resumo (pendentes, sem itens) para manifestar em lote.
  const resumoParaManifestar = notas
    .filter((n) => n.situacao === "pendente" && !comItens.has(n.id))
    .map((n) => ({
      id: n.id,
      emit_nome: n.emit_nome,
      numero: n.numero,
      data_emissao: n.data_emissao,
    }));

  // Contagem de parcelas por nota (para o selo "Nx" na lista).
  const parcCount = new Map<string, number>();
  {
    const { data: parc } = await supabase
      .from("nota_parcelas")
      .select("nota_id")
      .in("nota_id", notas.map((n) => n.id));
    for (const p of (parc as { nota_id: string }[]) ?? [])
      parcCount.set(p.nota_id, (parcCount.get(p.nota_id) ?? 0) + 1);
  }

  const linhas: NotaLinha[] = notas.map((n) => ({
    id: n.id,
    numero: n.numero,
    emit_nome: n.emit_nome,
    valor: Number(n.valor),
    data_emissao: n.data_emissao,
    vencimento: n.vencimento,
    situacao: n.situacao,
    aguardando: aguardando(n),
    parcelas: parcCount.get(n.id) ?? 0,
  }));

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            Notas Fiscais
          </h1>
          <p className="mt-1 text-zinc-500">
            Importe o XML da NF-e. Ela vira conta a pagar e pode ser cruzada com
            o pedido.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/notas/sefaz"
            className="rounded-lg border border-orange-500 px-4 py-2 text-sm font-medium text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950"
          >
            SEFAZ automático
          </Link>
          <UploadNota />
        </div>
      </div>

      <div className="mb-6">
        <BuscarNotas bloqueadoAte={bloqueadoAte} />
      </div>

      <ManifestarLote notas={resumoParaManifestar} />

      {notas.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 p-12 text-center text-zinc-500 dark:border-zinc-700">
          Nenhuma nota ainda. Clique em <b>+ Importar XML</b> e escolha os
          arquivos <b>.xml</b> das notas.
        </div>
      ) : (
        <NotasLista notas={linhas} />
      )}
    </div>
  );
}
