import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return {
      // beforeFiles roda antes das rotas do app. A raiz abre coisas
      // diferentes conforme o endereço: no sistema.* é a capa do sistema
      // (equipe), em qualquer outro (www, .vercel.app) é o site do
      // restaurante.
      beforeFiles: [
        {
          source: "/",
          has: [{ type: "host", value: "sistema.brasarestaurante.com.br" }],
          destination: "/sistema",
        },
        {
          source: "/",
          missing: [{ type: "host", value: "sistema.brasarestaurante.com.br" }],
          destination: "/site/index.html",
        },
      ],
      afterFiles: [
        // URL curta do app de marmitas: /marmitas serve o /marmitas.html.
        { source: "/marmitas", destination: "/marmitas.html" },
        // O site também responde em /site.
        { source: "/site", destination: "/site/index.html" },
      ],
      fallback: [],
    };
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
