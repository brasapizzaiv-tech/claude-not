import type { Metadata, Viewport } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { dadosDoMural, empresaDaChaveMural } from "@/lib/mural-server";
import { MuralTv } from "./mural-tv";

export const metadata: Metadata = {
  title: "Mural do escritório",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#211915" };
export const dynamic = "force-dynamic";

// O MURAL NUMA TV
//
// O mural do painel pede login, e numa TV isso não funciona: a sessão cai, não
// tem ninguém ali pra digitar senha, e a tela passa o dia na página de login.
// Aqui vale a chave do endereço, igual à TV da cozinha — só que a chave mora no
// banco e pertence a uma empresa, então o link de uma casa nunca abre o mural
// de outra.
//
// O desenho NÃO é o mesmo componente do painel. O aparelho de Android TV do
// escritório não roda o CSS moderno em que o painel é escrito: ele recebeu a
// página e despejou tudo numa lista sem formato. Então esta tela tem a sua
// própria versão, em HTML simples — ver src/app/tv/mural/mural-tv.tsx. Os
// números dos dois lados saem do mesmo lugar (src/lib/mural-server.ts).
export default async function MuralTvPage({
  searchParams,
}: {
  searchParams: Promise<{ chave?: string; tamanho?: string }>;
}) {
  const { chave = "", tamanho = "" } = await searchParams;
  const empresaId = await empresaDaChaveMural(chave);

  if (!empresaId) {
    return (
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          boxSizing: "border-box",
          background: "#211915",
          color: "#9b8878",
          fontFamily: "system-ui, -apple-system, Roboto, Arial, sans-serif",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "4vw",
        }}
      >
        <div>
          <div style={{ fontSize: "3vw", fontWeight: 700, color: "#e8ded5" }}>Mural do escritório</div>
          <div style={{ fontSize: "1.6vw", marginTop: "1vw" }}>
            Abra pelo link completo, com a chave no fim do endereço.
          </div>
        </div>
      </div>
    );
  }

  const { folgas, solicitacoes, hoje } = await dadosDoMural(createAdminClient(), empresaId);

  // O tamanho da letra já sai proporcional à TV (é tudo em "por cento da
  // largura"). O ?tamanho= continua valendo como empurrãozinho, caso a TV do
  // Rafael fique num canto mais longe do que a gente supôs.
  const ajuste = Math.min(Math.max(Number(tamanho) || 1, 0.5), 2);

  return <MuralTv folgas={folgas} solicitacoes={solicitacoes} hoje={hoje} ajuste={ajuste} />;
}
