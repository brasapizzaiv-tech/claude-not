import type { Metadata } from "next";

// Faz o "Adicionar à tela de início" a partir do app do garçom instalar um
// atalho que abre direto em /garcom (e não no site). No iPhone o atalho já usa
// a página atual; estas metas garantem que abra em tela cheia.
export const metadata: Metadata = {
  manifest: "/garcom.webmanifest",
  title: "Brasa Garçom",
  appleWebApp: { capable: true, title: "Garçom", statusBarStyle: "black-translucent" },
};

export default function GarcomLayout({ children }: { children: React.ReactNode }) {
  return children;
}
