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
        className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        Copiar
      </button>
      <a
        href={waHref}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"
      >
        Enviar no WhatsApp
      </a>
    </div>
  );
}
