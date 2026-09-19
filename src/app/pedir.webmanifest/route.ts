import { respostaManifesto } from "@/lib/manifesto";

// Manifest do cardápio do cliente.
export const dynamic = "force-dynamic";

export function GET() {
  return respostaManifesto({
    sufixo: "Peça online",
    descricao: "Peça delivery ou retirada.",
    startUrl: "/pedir",
    scope: "/pedir",
    // Este app já tem ícones próprios em dois tamanhos; os outros usam o logo.
    icones: [
      { src: "/icons/pedir-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/pedir-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
    ],
  });
}
