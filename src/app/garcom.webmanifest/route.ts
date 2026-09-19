import { respostaManifesto } from "@/lib/manifesto";

// Manifest do app do garçom. Antes era um arquivo parado com theme_color
// AZUL ("#2563eb"), que não tinha nada a ver com a casa.
export const dynamic = "force-dynamic";

export function GET() {
  return respostaManifesto({
    sufixo: "Garçom",
    descricao: "App do garçom: mesas, pedidos e conta.",
    startUrl: "/garcom",
    scope: "/garcom",
    escuro: true, // o app do garçom é escuro sempre
  });
}
