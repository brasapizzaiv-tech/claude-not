"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { EtiquetaVisual } from "@/components/etiqueta-ui";
import type { EtiquetaConfig, EtiquetaDados } from "@/lib/etiqueta-tipos";

// Impressão pelo navegador (alternativa ao agente): mostra a etiqueta com o QR
// real e um botão de imprimir. O desenho é o mesmo do PDF/pré-visualização.
export function EtiquetaImpressao({ d, config }: { d: EtiquetaDados; config: EtiquetaConfig | null }) {
  const [qr, setQr] = useState("");
  useEffect(() => {
    const url = `${window.location.origin}/e/${d.id}`;
    QRCode.toDataURL(url, { margin: 0, width: 200 }).then(setQr);
  }, [d.id]);

  const w = config?.largura ?? 55;
  const h = config?.altura ?? 55;

  return (
    <div>
      <style>{`
        @media print {
          @page { size: ${w}mm ${h}mm; margin: 0; }
          body * { visibility: hidden !important; }
          .etiqueta-print, .etiqueta-print * { visibility: visible !important; }
          .etiqueta-print { position: absolute; left: 0; top: 0; }
        }
      `}</style>

      <EtiquetaVisual d={d} config={config} qr={qr || null} />

      <div className="mt-4 print:hidden">
        <button
          onClick={() => window.print()}
          className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
        >
          Imprimir etiqueta
        </button>
        <p className="mt-2 text-xs text-zinc-400">
          Etiqueta {w}×{h}mm. Na janela de impressão, escolha a impressora de etiquetas e o papel {w}×{h}mm.
          (Pelo agente de impressão ela já saiu sozinha ao gerar.)
        </p>
      </div>
    </div>
  );
}
