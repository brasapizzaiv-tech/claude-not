import type { NextConfig } from "next";

// Projeto dos CLIENTES (decisão 2 do multiempresa: um código, dois bancos):
// é o que tem o banco próprio nas variáveis (mesma regra de
// src/lib/supabase/config.ts). Lá não existe site de restaurante nem app de
// marmitas — a raiz e os endereços do site da Brasa levam pro sistema.
const PROJETO_CLIENTES = !!(
  process.env.NEXT_PUBLIC_BANCO_URL?.trim() && process.env.NEXT_PUBLIC_BANCO_ANON_KEY?.trim()
);

const nextConfig: NextConfig = {
  async rewrites() {
    if (PROJETO_CLIENTES) return { beforeFiles: [], afterFiles: [], fallback: [] };
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
    if (PROJETO_CLIENTES) {
      return ["/", "/site", "/site/:path*", "/marmitas", "/marmitas.html", "/cardapio"].map((source) => ({
        source,
        destination: "/dashboard",
        permanent: false,
      }));
    }
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
      // Vale para os dois caminhos: a raiz do domínio e o /site.
      {
        source: "/site/index.html",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
      {
        source: "/",
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
