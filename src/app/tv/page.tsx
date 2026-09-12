import type { Metadata, Viewport } from "next";
import { TvClient } from "./tv-client";

// TV da cozinha: tela cheia, sem menu. A chave da URL é conferida no servidor
// antes de renderizar qualquer coisa; sem ela a página nem carrega a fila.
export const metadata: Metadata = { title: "Rodízio · Cozinha", robots: { index: false, follow: false } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, userScalable: false, themeColor: "#0b0b0b" };
export const dynamic = "force-dynamic";

export default async function TvPage({ searchParams }: { searchParams: Promise<{ chave?: string }> }) {
  const { chave = "" } = await searchParams;
  const esperada = (process.env.RODIZIO_TV_CHAVE ?? "").trim();
  const autorizado = !!esperada && chave === esperada;

  if (!autorizado) {
    return (
      <div style={{ minHeight: "100vh", background: "#0b0b0b", color: "#888", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif", textAlign: "center", padding: 32 }}>
        <div>
          <p style={{ fontSize: 28, fontWeight: 800, color: "#ccc" }}>Quadro do rodízio</p>
          <p style={{ marginTop: 8, fontSize: 18 }}>
            {esperada ? "Endereço incompleto: abra o link com a chave (…/tv?chave=…)." : "Falta configurar RODIZIO_TV_CHAVE no servidor."}
          </p>
        </div>
      </div>
    );
  }

  return <TvClient chave={chave} />;
}
