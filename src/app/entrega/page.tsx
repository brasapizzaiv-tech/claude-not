import type { Metadata, Viewport } from "next";
import { lerMarca } from "@/lib/marca";
import { SemZoom } from "@/components/sem-zoom";
import { EntradaEntrega } from "./entrada";

export const metadata: Metadata = { title: "Brasa Entregas", robots: { index: false, follow: false } };
// App do entregador: escuro sempre, na cor escura da empresa.
export async function generateViewport(): Promise<Viewport> {
  const { escuro } = await lerMarca();
  return { width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false, themeColor: escuro };
}
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
