import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      // URL curta do app de marmitas: /marmitas serve o /marmitas.html.
      { source: "/marmitas", destination: "/marmitas.html" },
    ];
  },
};

export default nextConfig;
