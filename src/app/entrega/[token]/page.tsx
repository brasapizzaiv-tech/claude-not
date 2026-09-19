import type { Metadata, Viewport } from "next";
import { lerMarca } from "@/lib/marca";
import { SemZoom } from "@/components/sem-zoom";
import { minhasEntregas, sessaoEntregador } from "./entrega-actions";
import { EntregaClient } from "./entrega-client";

// Manifest por token: o atalho na tela inicial abre em /entrega/{token}, e não no site.
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  return {
    title: "Entregas · Brasa",
    robots: { index: false, follow: false },
    manifest: `/entrega/${encodeURIComponent(token)}/manifest.webmanifest`,
    icons: { icon: "/icons/entregas-192.png", apple: "/icons/entregas-192.png" },
    appleWebApp: { capable: true, title: "Entregas", statusBarStyle: "black-translucent" },
  };
}
// App do entregador: escuro sempre, na cor escura da empresa.
export async function generateViewport(): Promise<Viewport> {
  const { escuro } = await lerMarca();
  return { width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false, themeColor: escuro };
}
export const dynamic = "force-dynamic";

// App do entregador: entra pelo link pessoal (token), sem login.
export default async function EntregaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const boy = await sessaoEntregador(token);
  if (!boy) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-painel-fundo p-6 text-center text-texto-suave">
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
