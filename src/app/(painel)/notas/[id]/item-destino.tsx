"use client";

// "Pra quem é" cada item da nota (migration 0243): o padrão é a casa
// (estoque). Ana e Rafa → sai do estoque/CMV e vai pra "Consumo dos sócios";
// funcionário → sai do estoque/CMV e vira Compra interna da pessoa.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { avisar } from "@/components/dialogo";
import { definirDestinoItemNota } from "../actions";

type Destino = "" | "socios" | "funcionario";

export function ItemDestino({
  itemId,
  destino,
  colaboradorId,
  colaboradores,
}: {
  itemId: string;
  destino: string | null;
  colaboradorId: string | null;
  colaboradores: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const [salvando, start] = useTransition();
  const [d, setD] = useState<Destino>((destino as Destino) ?? "");
  const [colab, setColab] = useState(colaboradorId ?? "");

  function gravar(novo: Destino, novoColab: string) {
    if (novo === "funcionario" && !novoColab) return; // espera escolher a pessoa
    start(async () => {
      const r = await definirDestinoItemNota(itemId, novo || null, novo === "funcionario" ? novoColab : null);
      if (!r.ok) { void avisar(r.mensagem); return; }
      if (r.notaLancada) {
        void avisar(
          "Feito: o item já saiu do estoque e do CMV.",
          "Esta nota já tinha sido lançada no financeiro. Pra separar o valor na conta certa (sócios / pessoal), estorne e lance a nota de novo.",
        );
      }
      router.refresh();
    });
  }

  const campo = "rounded border border-borda-forte bg-transparent px-1.5 py-1 text-xs text-texto dark:bg-zinc-950";
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5">
      <select
        value={d}
        onChange={(e) => { const v = e.target.value as Destino; setD(v); gravar(v, colab); }}
        disabled={salvando}
        aria-label="Pra quem é este item"
        title="Item que não é da casa sai do estoque e do CMV"
        className={`${campo} ${d ? "border-orange-400 bg-orange-50/60 dark:border-orange-700 dark:bg-orange-950/20" : ""}`}
      >
        <option value="">Pra casa (estoque)</option>
        <option value="socios">Pra Ana e Rafa</option>
        <option value="funcionario">Pra funcionário…</option>
      </select>
      {d === "funcionario" && (
        <select
          value={colab}
          onChange={(e) => { setColab(e.target.value); gravar("funcionario", e.target.value); }}
          disabled={salvando}
          aria-label="Funcionário"
          className={campo}
        >
          <option value="">— quem? —</option>
          {colaboradores.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      )}
      {d === "funcionario" && colab && <span className="text-mini text-texto-suave">vai pra Compras internas</span>}
      {d === "socios" && <span className="text-mini text-texto-suave">fora do estoque e do CMV</span>}
    </div>
  );
}
