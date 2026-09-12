import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { sessaoGarcom } from "@/lib/garcom-auth";
import { SemZoom } from "@/components/sem-zoom";

// Faz o "Adicionar à tela de início" a partir do app do garçom instalar um
// atalho que abre direto em /garcom (e não no site). No iPhone o atalho já usa
// a página atual; estas metas garantem que abra em tela cheia.
export const metadata: Metadata = {
  manifest: "/garcom.webmanifest",
  title: "Brasa Garçom",
  appleWebApp: { capable: true, title: "Garçom", statusBarStyle: "black-translucent" },
};

// Sem zoom no modo garçom (pinça/toque duplo), igual ao app da equipe: o
// garçom encostava dois dedos e a tela ficava ampliada.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default async function GarcomLayout({ children }: { children: React.ReactNode }) {
  // Entra: usuário do sistema com permissão de garçom/salão, ou colaborador
  // marcado como garçom vindo do app pessoal (cookie).
  const s = await sessaoGarcom();
  if (!s) redirect("/login?next=/garcom");
  if (!s.podeGarcom) redirect("/dashboard");
  return (
    <>
      <SemZoom />
      {children}
    </>
  );
}
