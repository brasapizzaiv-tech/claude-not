"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { definirNfceAuto } from "@/app/(painel)/salao/fiscal-actions";

// Interruptor "NFC-e automática": com ele ligado, venda paga em Pix ou cartão
// emite a nota sozinha (caixa e PDV). Dinheiro continua manual.
export function NfceAutoToggle({ ligado, producao, compacto }: { ligado: boolean; producao: boolean; compacto?: boolean }) {
  const router = useRouter();
  const [pend, start] = useTransition();
  function alternar() {
    start(async () => {
      await definirNfceAuto(!ligado);
      router.refresh();
    });
  }
  return (
    <button
      type="button"
      onClick={alternar}
      disabled={pend}
      title={producao ? "Pix e cartão emitem a NFC-e sozinhos. Clique pra ligar/desligar." : "Só funciona com o fiscal em produção."}
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm disabled:opacity-60 ${
        ligado && producao
          ? "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          : "border-zinc-300 text-zinc-500 dark:border-zinc-700 dark:text-zinc-400"
      }`}
    >
      <span className={`inline-block h-4 w-7 rounded-full p-0.5 transition ${ligado ? "bg-emerald-500" : "bg-zinc-400"}`}>
        <span className={`block h-3 w-3 rounded-full bg-white transition ${ligado ? "translate-x-3" : ""}`} />
      </span>
      {compacto ? "Nota auto" : `NFC-e automática (Pix/cartão): ${ligado ? "ligada" : "desligada"}`}
      {!producao && !compacto && <span className="text-[10px] text-amber-600">só em produção</span>}
    </button>
  );
}

// Forma de pagamento que dispara a nota automática.
export function formaEmiteAuto(forma: string) {
  const f = (forma || "").toLowerCase();
  return f.includes("pix") || f.includes("cart") || f.includes("débito") || f.includes("debito") || f.includes("crédito") || f.includes("credito");
}
