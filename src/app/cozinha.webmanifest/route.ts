import { respostaManifesto } from "@/lib/manifesto";

// Manifest do tablet da cozinha: "Instalar app"/"Adicionar à tela inicial"
// abre direto em /cozinha, em TELA CHEIA (sem barra de endereço nem a barra do
// Android) e deitado. Público como o do sistema: o navegador busca sem login.
export const dynamic = "force-dynamic";

export function GET() {
  return respostaManifesto({
    sufixo: "Cozinha",
    descricao: "Tablet da cozinha: pedidos do delivery e do rodízio.",
    startUrl: "/cozinha",
    scope: "/cozinha",
    escuro: true,
    display: "fullscreen",
    orientation: "landscape",
    // O Android só instala com ícone de 192 e 512 (o logo "any" não basta).
    icones: [
      { src: "/icons/pedir-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/pedir-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
    ],
  });
}
