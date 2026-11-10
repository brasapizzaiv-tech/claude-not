import Link from "next/link";
import { Icone } from "@/components/icone";
import { avisosDeSaude } from "@/lib/saude-painel";

// Faixa de aviso da Saúde do sistema (tela inicial, caixa e PDV). Só aparece
// quando alguma peça está parada ou pede atenção: impressão sem sinal, comanda
// presa na fila, balança com pesagem que não subiu, SEFAZ parada, certificado
// vencendo, rotina do Kern que não rodou... (auditoria, Onda 2).
export async function AvisoSaude({ empresaId, className = "" }: { empresaId: string | null; className?: string }) {
  const avisos = await avisosDeSaude(empresaId);
  if (avisos.length === 0) return null;
  return (
    <Link
      href="/saude"
      className={`${className} flex min-h-11 items-start gap-3 rounded-cartao bg-urgente-fundo px-4 py-3 text-sm text-urgente-texto`}
    >
      <Icone nome="alerta" tamanho={18} className="mt-0.5 shrink-0" />
      <span className="min-w-0 flex-1">
        <b>{avisos.length === 1 ? "1 aviso" : `${avisos.length} avisos`} na Saúde do sistema:</b>{" "}
        {avisos.slice(0, 3).join(" · ")}
        {avisos.length > 3 ? ` · e mais ${avisos.length - 3}` : ""}
      </span>
      <span className="shrink-0 font-semibold underline">Ver</span>
    </Link>
  );
}
