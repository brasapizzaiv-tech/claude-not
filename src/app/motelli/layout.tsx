import type { Metadata } from "next";
import Link from "next/link";
import { CONTATO_EMAIL, CORES, FONTE_TEXTO, FONTE_TITULO } from "./marca";

// Site da marca Motelli (motelli.com.br). É a vitrine do sistema e a casa da
// política de privacidade que a Play Store exige. Não é o sistema: quem usa o
// Motelli entra pelo endereço da própria empresa.
//
// A empresa dona da marca aparece só onde a lei obriga (política de
// privacidade); em todo o resto, é Motelli.
export const metadata: Metadata = {
  title: "Motelli",
  description: "Motelli: o sistema do restaurante, do pedido ao caixa.",
  manifest: null,
};

export default function MotelliLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-tema="claro"
      style={{
        minHeight: "100vh",
        background: CORES.papel,
        color: CORES.tinta,
        fontFamily: FONTE_TEXTO,
      }}
    >
      <header style={{ maxWidth: 1040, margin: "0 auto", padding: "22px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link href="/motelli" style={{ textDecoration: "none", color: CORES.tinta, fontFamily: FONTE_TITULO, fontWeight: 700, fontSize: 24, letterSpacing: "-0.03em" }}>
          Motelli
        </Link>
        <nav style={{ display: "flex", gap: 22, fontSize: 15 }}>
          <a href={`mailto:${CONTATO_EMAIL}`} style={{ color: CORES.suave, textDecoration: "none" }}>Contato</a>
          <Link href="/motelli/privacidade" style={{ color: CORES.suave, textDecoration: "none" }}>Privacidade</Link>
        </nav>
      </header>
      {children}
      <footer style={{ maxWidth: 1040, margin: "0 auto", padding: "40px 24px 48px", borderTop: `1px solid ${CORES.linha}`, color: CORES.suave, fontSize: 14, display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "space-between" }}>
        <span>Motelli · sistema para restaurantes</span>
        <span>
          <Link href="/motelli/privacidade" style={{ color: CORES.suave }}>Política de privacidade</Link>
          {" · "}
          <a href={`mailto:${CONTATO_EMAIL}`} style={{ color: CORES.suave }}>{CONTATO_EMAIL}</a>
        </span>
      </footer>
    </div>
  );
}
