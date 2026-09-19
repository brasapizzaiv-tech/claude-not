import { respostaManifesto } from "@/lib/manifesto";

// Manifest do app do entregador, por token: o atalho "Adicionar à tela
// inicial" abre direto em /entrega/{token} (e não no site), em tela cheia.
// Cor e nome saem do cadastro da empresa; os ícones são próprios deste app.
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const base = `/entrega/${encodeURIComponent(token)}`;
  return respostaManifesto({
    sufixo: "Entregas",
    descricao: "App do entregador: rotas, baixa e acerto do dia.",
    startUrl: base,
    scope: base,
    escuro: true, // o app do entregador é escuro sempre
    icones: [
      { src: "/icons/entregas-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/entregas-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/entregas-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  });
}
