import type { Viewport } from "next";
import { filaRodizio } from "./actions";
import { CozinhaClient } from "./cozinha-client";

export const metadata = { title: "Rodízio · Cozinha · Brasa" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, userScalable: false };
export const dynamic = "force-dynamic";

// Tablet da cozinha (login normal, permissão "rodizio"). O menu lateral se
// esconde nesta rota, como nas outras telas de tela cheia.
export default async function CozinhaPage() {
  const inicial = await filaRodizio();
  return <CozinhaClient inicial={inicial} />;
}
