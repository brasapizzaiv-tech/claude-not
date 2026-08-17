import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      // URL curta do app de marmitas: /marmitas serve o /marmitas.html.
      { source: "/marmitas", destination: "/marmitas.html" },
    ];
  },
  async headers() {
    return [
      // O app de marmitas é atualizado com frequência: nunca cachear o HTML,
      // pra toda mudança aparecer na hora (sem precisar limpar o navegador).
      {
        source: "/marmitas.html",
        headers: [
          { key: "Cache-Control", value: "no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
