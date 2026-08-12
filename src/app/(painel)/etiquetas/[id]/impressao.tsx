"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { dataBR } from "@/lib/format";

export function EtiquetaImpressao({
  id,
  numero,
  produto,
  colaborador,
  manipuladoEm,
  validade,
}: {
  id: string;
  numero: number;
  produto: string;
  colaborador: string | null;
  manipuladoEm: string;
  validade: string | null;
}) {
  const [qr, setQr] = useState("");

  useEffect(() => {
    const url = `${window.location.origin}/e/${id}`;
    QRCode.toDataURL(url, { margin: 1, width: 220 }).then(setQr);
  }, [id]);

  const manip = new Date(manipuladoEm).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .etiqueta-print, .etiqueta-print * { visibility: visible !important; }
          .etiqueta-print { position: absolute; left: 0; top: 0; }
        }
      `}</style>

      <div className="etiqueta-print inline-block rounded-xl border-2 border-zinc-800 bg-white p-4 text-black" style={{ width: 320 }}>
        <div className="text-center text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Brasa · Etiqueta de manipulação
        </div>
        <div className="mt-1 text-center text-xl font-extrabold leading-tight">
          {produto}
        </div>
        <div className="mt-3 flex items-start justify-between gap-3">
          <div className="space-y-1 text-sm">
            <div>
              Validade:{" "}
              <b>{validade ? dataBR(validade) : "—"}</b>
            </div>
            <div>Manipulado: {manip}</div>
            <div>Por: {colaborador ?? "—"}</div>
            <div className="pt-1 font-mono text-xs text-zinc-500">
              Etiqueta #{numero}
            </div>
          </div>
          {qr && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="QR" style={{ width: 90, height: 90 }} />
          )}
        </div>
      </div>

      <div className="mt-4 print:hidden">
        <button
          onClick={() => window.print()}
          className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
        >
          Imprimir etiqueta
        </button>
      </div>
    </div>
  );
}
