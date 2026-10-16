import type { Viewport } from "next";
import { SemZoom } from "@/components/sem-zoom";
import { CoresDaEmpresa } from "@/components/cores-da-empresa";
import { Dialogos } from "@/components/dialogo";

// App da equipe (celular): sem zoom na página em nenhuma tela.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // No app (iPhone) a página vai até a borda: o espaço da barra do relógio e
  // do traço de baixo é reservado no invólucro abaixo (env(safe-area-inset-*)).
  viewportFit: "cover",
};

export default function EuLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <CoresDaEmpresa />
      <Dialogos />
      <SemZoom />
      {/* Sem isto o topo da tela ficava por baixo do relógio e da bateria no app do iPhone. */}
      <div style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        {children}
      </div>
    </>
  );
}
