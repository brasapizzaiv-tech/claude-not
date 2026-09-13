export const dynamic = "force-dynamic";

// Manifest do app do entregador, por token: o atalho "Adicionar à tela
// inicial" abre direto em /entrega/{token} (e não no site), em tela cheia,
// com o ícone da Brasa.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const base = `/entrega/${encodeURIComponent(token)}`;
  const manifest = {
    name: "Brasa Entregas",
    short_name: "Entregas",
    description: "App do entregador da Brasa",
    start_url: base,
    scope: base,
    display: "standalone",
    orientation: "portrait",
    background_color: "#09090b",
    theme_color: "#211915",
    icons: [
      { src: "/icons/entregas-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/entregas-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/entregas-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  return new Response(JSON.stringify(manifest), { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "no-store" } });
}
