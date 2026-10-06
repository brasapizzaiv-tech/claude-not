"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { definirEntradaNota } from "../actions";

// Dia em que a mercadoria desta nota deu entrada. O Lançar preenche sozinho;
// aqui o Rafael corrige quando o fornecedor emitiu numa semana e entregou na
// outra. A contagem soma "o que chegou" por esta data.
export function EntradaNota({ notaId, dia }: { notaId: string; dia: string | null }) {
  const router = useRouter();
  const [salvando, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-texto-suave">
      <label htmlFor="entrada-nota" className="text-texto">
        Mercadoria entrou em
      </label>
      <input
        id="entrada-nota"
        type="date"
        defaultValue={dia ?? ""}
        disabled={salvando}
        onChange={(e) => {
          const v = e.target.value;
          if (!v) return;
          setErro(null);
          start(async () => {
            const r = await definirEntradaNota(notaId, v);
            if (!r.ok) setErro(r.erro ?? "Não salvou.");
            else router.refresh();
          });
        }}
        className="min-h-9 rounded-controle border border-borda-forte bg-transparent px-2 text-sm text-texto focus:border-primaria"
      />
      <span className="text-mini text-texto-fraco">
        {dia ? "a contagem conta o que chegou a partir deste dia" : "ainda sem entrada: o Lançar marca o dia de hoje"}
      </span>
      {erro && <span className="text-mini text-erro">{erro}</span>}
    </div>
  );
}
