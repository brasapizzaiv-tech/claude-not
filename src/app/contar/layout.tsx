import type { Viewport } from "next";
import { SemZoom } from "@/components/sem-zoom";

// Contagem (link) — app de celular: sem zoom (pinça/toque duplo), regra da casa.
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false };

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SemZoom />
      {children}
    </>
  );
}
