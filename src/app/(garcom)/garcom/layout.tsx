import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { sessaoGarcom } from "@/lib/garcom-auth";

// Faz o "Adicionar à tela de início" a partir do app do garçom instalar um
// atalho que abre direto em /garcom (e não no site). No iPhone o atalho já usa
// a página atual; estas metas garantem que abra em tela cheia.
export const metadata: Metadata = {
  manifest: "/garcom.webmanifest",
  title: "Brasa Garçom",
  appleWebApp: { capable: true, title: "Garçom", statusBarStyle: "black-translucent" },
};

export default async function GarcomLayout({ children }: { children: React.ReactNode }) {
  // Entra: usuário do sistema com permissão de garçom/salão, ou colaborador
  // marcado como garçom vindo do app pessoal (cookie).
  const s = await sessaoGarcom();
  if (!s) redirect("/login?next=/garcom");
  if (!s.podeGarcom) redirect("/dashboard");
  return children;
}
