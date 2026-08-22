"use client";

// Botão de impressão + CSS para a impressora térmica 80mm (Elgin i8).
// Ao imprimir, isola o cupom (.comanda-cupom) e usa página de 80mm.
export function ImprimirComanda() {
  return (
    <>
      <button
        onClick={() => window.print()}
        className="nao-imprimir rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
      >
        🖨️ Imprimir comanda (80mm)
      </button>
      <style>{`
        @media print {
          @page { size: 72mm auto; margin: 0; }
          html, body { margin: 0 !important; background: #fff !important; }
          body * { visibility: hidden; }
          .comanda-cupom, .comanda-cupom * { visibility: visible; }
          .comanda-cupom {
            position: absolute; left: 0; top: 0;
            width: 72mm; box-sizing: border-box;
            border: none !important; border-radius: 0 !important;
            background: #fff !important; color: #000 !important;
            padding: 3mm 3mm !important; margin: 0 !important;
          }
          .comanda-cupom * { color: #000 !important; background: transparent !important; }
          /* Logo laranja vira preto sólido para sair nítida na térmica */
          .comanda-cupom img { filter: brightness(0) !important; }
          .nao-imprimir { display: none !important; }
        }
      `}</style>
    </>
  );
}
