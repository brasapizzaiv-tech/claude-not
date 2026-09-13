import type { Metadata, Viewport } from "next";
import { SemZoom } from "@/components/sem-zoom";
import { minhasEntregas, sessaoEntregador } from "./entrega-actions";
import { EntregaClient } from "./entrega-client";

export const metadata: Metadata = { title: "Entregas · Brasa", robots: { index: false, follow: false } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false, themeColor: "#09090b" };
export const dynamic = "force-dynamic";

// App do entregador: entra pelo link pessoal (token), sem login.
export default async function EntregaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const boy = await sessaoEntregador(token);
  if (!boy) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-6 text-center text-zinc-300">
        <div>
          <p className="text-2xl font-bold">Link inválido</p>
          <p className="mt-2 text-sm">Peça o seu link de entregador pra gerência.</p>
        </div>
      </div>
    );
  }
  const dados = await minhasEntregas(token);
  return (
    <>
      <SemZoom />
      <EntregaClient token={token} boy={boy} inicial={dados!} />
    </>
  );
}
