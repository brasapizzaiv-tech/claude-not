import type { Metadata, Viewport } from "next";
import { lerMarca } from "@/lib/marca";
import { SemZoom } from "@/components/sem-zoom";
import { CoresDaEmpresa } from "@/components/cores-da-empresa";

// App do cliente (/pedir): manifest próprio (o atalho abre no cardápio, não no
// site), tela cheia no iPhone e zoom travado — regra da casa pra todo app.
export const metadata: Metadata = {
  manifest: "/pedir.webmanifest",
  icons: { icon: "/icons/pedir-192.png", apple: "/icons/pedir-192.png" },
  appleWebApp: { capable: true, title: "Brasa Pedidos", statusBarStyle: "default" },
};
// A cor da barra do navegador vem do cadastro da empresa, não escrita aqui.
export async function generateViewport(): Promise<Viewport> {
  const { primaria } = await lerMarca();
  return { width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false, themeColor: primaria };
}

export default function PedirLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <CoresDaEmpresa />
      <SemZoom />
      {children}
    </>
  );
}
