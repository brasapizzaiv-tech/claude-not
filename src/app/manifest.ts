import type { MetadataRoute } from "next";

// Torna o site "instalável" (Adicionar à tela de início) com cara de app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Brasa · Contagem",
    short_name: "Brasa",
    description: "Contagem de estoque da Brasa Pizza",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#f97316",
    icons: [
      { src: "/logo-brasa.png", sizes: "any", type: "image/png", purpose: "any" },
    ],
  };
}
