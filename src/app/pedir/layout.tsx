import type { Metadata, Viewport } from "next";
import { SemZoom } from "@/components/sem-zoom";

// App do cliente (/pedir): manifest próprio (o atalho abre no cardápio, não no
// site), tela cheia no iPhone e zoom travado — regra da casa pra todo app.
export const metadata: Metadata = {
  manifest: "/pedir.webmanifest",
  icons: { icon: "/icons/pedir-192.png", apple: "/icons/pedir-192.png" },
  appleWebApp: { capable: true, title: "Brasa Pedidos", statusBarStyle: "default" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false, themeColor: "#C78340" };

export default function PedirLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SemZoom />
      {children}
    </>
  );
}
