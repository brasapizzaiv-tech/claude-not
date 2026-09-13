import type { Metadata, Viewport } from "next";
import { SemZoom } from "@/components/sem-zoom";
import { EntradaEntrega } from "./entrada";

export const metadata: Metadata = { title: "Brasa Entregas", robots: { index: false, follow: false } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false, themeColor: "#09090b" };
export const dynamic = "force-dynamic";

// Porta de entrada do APP NATIVO do entregador (Capacitor abre esta página):
// pede o link pessoal uma vez, guarda no aparelho e segue pra /entrega/{token}.
export default function EntregaInicioPage() {
  return (
    <>
      <SemZoom />
      <EntradaEntrega />
    </>
  );
}
