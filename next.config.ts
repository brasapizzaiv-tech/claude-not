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
      // Links públicos abertos no celular (fornecedor, colaborador): nunca
      // cachear, pra sempre pegar a versão atual e o rascunho salvo.
      {
        source: "/cotar/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
      {
        source: "/contar/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
      {
        source: "/eu/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
