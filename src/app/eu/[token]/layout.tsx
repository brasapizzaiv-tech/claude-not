import type { Viewport } from "next";
import { SemZoom } from "@/components/sem-zoom";

// App da equipe (celular): sem zoom na página em nenhuma tela.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function EuLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SemZoom />
      {children}
    </>
  );
}
