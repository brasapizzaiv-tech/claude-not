import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return {
      // beforeFiles roda antes das rotas do app: é o que faz a raiz do
      // domínio (www.brasarestaurante.com.br) abrir o site do restaurante.
      // A equipe entra pelo /login (link "Equipe" no rodapé do site).
      beforeFiles: [{ source: "/", destination: "/site/index.html" }],
      afterFiles: [
        // URL curta do app de marmitas: /marmitas serve o /marmitas.html.
        { source: "/marmitas", destination: "/marmitas.html" },
        // O site também responde em /site.
        { source: "/site", destination: "/site/index.html" },
      ],
      fallback: [],
    };
  },
  async redirects() {
    return [
      // Link curto para mandar a quem pede o cardápio.
      { source: "/cardapio", destination: "/#cardapio", permanent: false },
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
      // Site do restaurante: HTML sempre fresco (as fotos seguem em cache).
      {
        source: "/site/index.html",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
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
