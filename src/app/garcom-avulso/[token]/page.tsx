import type { Metadata, Viewport } from "next";
import { conviteValido } from "../actions";
import { textoValidade } from "@/lib/garcom-avulso";
import { EntrarAvulso } from "./entrar";

export const metadata: Metadata = { title: "Garçom · Brasa", manifest: "/garcom.webmanifest" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false, viewportFit: "cover" };
export const dynamic = "force-dynamic";

// Link da noite do garçom avulso (migration 0249): digita o nome e entra.
export default async function GarcomAvulsoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const conv = await conviteValido(token);
  return (
    <main className="area-segura flex min-h-dvh items-center justify-center bg-painel-fundo p-4" style={{ colorScheme: "dark" }} data-theme="dark">
      <div className="cartao w-full max-w-sm p-6 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-brasa.png" alt="Brasa" className="mx-auto h-16 w-auto" />
        <p className="rotulo mt-3">Garçom</p>
        {conv ? (
          <>
            <h1 className="mt-1 font-numero text-2xl font-bold text-texto">Qual é o seu nome?</h1>
            <p className="mt-1 text-sm text-texto-suave">Os pedidos que você lançar saem com esse nome. Vale até {textoValidade(conv.valido_ate)}.</p>
            <EntrarAvulso token={token} />
          </>
        ) : (
          <>
            <h1 className="mt-1 font-numero text-2xl font-bold text-texto">Este link não vale mais</h1>
            <p className="mt-2 text-sm text-texto-suave">Peça um link novo no caixa.</p>
          </>
        )}
      </div>
    </main>
  );
}
