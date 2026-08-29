"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { dataBR } from "@/lib/format";

const consLabel: Record<string, string> = {
  congelado: "CONGELADO",
  resfriado: "RESFRIADO",
  ambiente: "AMBIENTE",
};

export function EtiquetaImpressao({
  id,
  numero,
  produto,
  colaborador,
  manipuladoEm,
  validade,
  conservacao,
  quantidade,
  unidade,
}: {
  id: string;
  numero: number;
  produto: string;
  colaborador: string | null;
  manipuladoEm: string;
  validade: string | null;
  conservacao: string | null;
  quantidade: number | null;
  unidade: string | null;
}) {
  const [qr, setQr] = useState("");

  useEffect(() => {
    const url = `${window.location.origin}/e/${id}`;
    QRCode.toDataURL(url, { margin: 0, width: 200 }).then(setQr);
  }, [id]);

  const manip = new Date(manipuladoEm).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div>
      <style>{`
        @media print {
          @page { size: 55mm 55mm; margin: 0; }
          body * { visibility: hidden !important; }
          .etiqueta-print, .etiqueta-print * { visibility: visible !important; }
          .etiqueta-print { position: absolute; left: 0; top: 0; }
        }
      `}</style>

      {/* Etiqueta 55x55mm (impressora térmica Elgin L42 Pro, etiqueta picotada) */}
      <div
        className="etiqueta-print bg-white text-black"
        style={{
          width: "55mm",
          height: "55mm",
          padding: "3mm",
          boxSizing: "border-box",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div style={{ textAlign: "center", fontSize: "9px", fontWeight: 700, letterSpacing: 1 }}>
          BRASA · MANIPULAÇÃO
        </div>
        <div style={{ textAlign: "center", fontSize: "15px", fontWeight: 800, lineHeight: 1.1, margin: "2px 0" }}>
          {produto}
        </div>
        {conservacao && (
          <div style={{ textAlign: "center", fontSize: "11px", fontWeight: 700, border: "1px solid #000", borderRadius: 4, padding: "1px 0", margin: "1px 6mm" }}>
            {consLabel[conservacao] ?? conservacao}
          </div>
        )}
        {quantidade != null && (
          <div style={{ textAlign: "center", fontSize: "11px" }}>
            Qtd: <b>{quantidade} {unidade ?? ""}</b>
          </div>
        )}

        <div style={{ textAlign: "center", fontSize: "9px", marginTop: "2mm" }}>VALIDADE</div>
        <div style={{ textAlign: "center", fontSize: "22px", fontWeight: 800, lineHeight: 1 }}>
          {validade ? dataBR(validade) : "—"}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: "auto" }}>
          <div style={{ fontSize: "9px", lineHeight: 1.35 }}>
            <div>Manip.: {manip}</div>
            <div>Por: {colaborador ?? "—"}</div>
            <div>Nº {numero}</div>
          </div>
          {qr && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="QR" style={{ width: "16mm", height: "16mm" }} />
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
        <p className="mt-2 text-xs text-zinc-400">
          Etiqueta 55×55mm (Elgin L42 Pro). Na janela de impressão, escolha a
          impressora <b>Elgin L42</b> e o papel <b>55×55mm</b>.
        </p>
      </div>
    </div>
  );
}
