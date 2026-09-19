"use client";

export function PedidoAcoes({
  texto,
  whatsapp,
}: {
  texto: string;
  whatsapp: string | null;
}) {
  const zap = (whatsapp ?? "").replace(/\D/g, "");
  const waHref = zap
    ? `https://web.whatsapp.com/send?phone=55${zap}&text=${encodeURIComponent(texto)}`
    : `https://web.whatsapp.com/`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={() => navigator.clipboard.writeText(texto)}
        className="rounded-controle border border-borda-forte px-3 py-2 text-sm font-medium text-texto-suave hover:bg-superficie-suave dark:border-borda-forte"
      >
        Copiar
      </button>
      <a
        href={waHref}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-controle bg-texto px-3 py-2 text-sm font-medium text-fundo hover:opacity-90"
      >
        Enviar no WhatsApp
      </a>
    </div>
  );
}
