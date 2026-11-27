import type { Viewport } from "next";
import { filaDeliveryCozinha, filaRodizio } from "./actions";
import { CozinhaClient } from "./cozinha-client";

export const metadata = { title: "Cozinha" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, userScalable: false };
export const dynamic = "force-dynamic";

// Tablet da cozinha (login normal, permissão "rodizio"): pedidos do delivery
// com o botão Pronto + quadro do rodízio. O menu lateral se esconde nesta
// rota, como nas outras telas de tela cheia.
export default async function CozinhaPage() {
  const [inicial, inicialDelivery] = await Promise.all([filaRodizio(), filaDeliveryCozinha()]);
  return <CozinhaClient inicial={inicial} inicialDelivery={inicialDelivery} />;
}
