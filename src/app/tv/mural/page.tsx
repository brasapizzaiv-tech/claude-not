import type { Metadata, Viewport } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { dadosDoMural, empresaDaChaveMural } from "@/lib/mural-server";
import { Mural } from "@/app/(painel)/mural/mural";

export const metadata: Metadata = {
  title: "Mural do escritório",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#211915" };
export const dynamic = "force-dynamic";

// A MESMA TELA, NUMA TV
//
// O mural do painel pede login, e numa TV isso não funciona: a sessão cai, não
// tem ninguém ali pra digitar senha, e a tela passa o dia na página de login.
// Aqui vale a chave do endereço, igual à TV da cozinha — só que a chave mora no
// banco e pertence a uma empresa, então o link de uma casa nunca abre o mural
// de outra.
//
// O desenho é o mesmo componente do painel: o que o Rafael vê na mesa dele é,
// letra por letra, o que está na TV.
export default async function MuralTvPage({
  searchParams,
}: {
  searchParams: Promise<{ chave?: string; tamanho?: string }>;
}) {
  const { chave = "", tamanho = "" } = await searchParams;
  const empresaId = await empresaDaChaveMural(chave);

  if (!empresaId) {
    return (
      // "fixed inset-0" e não "min-h-screen": esta página cai dentro do
      // invólucro do site, que tem largura própria — centralizar dentro dele
      // deixava o aviso enfiado num canto da TV.
      <div
        data-tema="escuro"
        className="fixed inset-0 flex items-center justify-center bg-painel-fundo p-8 text-center"
      >
        <div>
          <p className="font-numero text-4xl font-semibold tracking-apertada text-texto">
            Mural do escritório
          </p>
          <p className="mt-3 text-xl text-texto-suave">
            Abra pelo link completo, com a chave no fim do endereço.
          </p>
        </div>
      </div>
    );
  }

  const { folgas, solicitacoes, hoje } = await dadosDoMural(createAdminClient(), empresaId);

  // Numa TV a pessoa lê de longe, e a tela é grande: 1,75 é o que faz o mural
  // ocupar um monitor de 1920 sem quebrar as três colunas (acima de 1,8 elas
  // empilham). O tamanho sai do endereço (?tamanho=1.5) pra o Rafael acertar
  // sozinho conforme a TV dele, sem depender de mim.
  const escala = Math.min(Math.max(Number(tamanho) || 1.75, 0.8), 3);

  return (
    // A TV fica num canto, ligada à noite: escuro sempre, como a da cozinha.
    <div data-tema="escuro" className="min-h-screen bg-painel-fundo">
      <div style={{ zoom: escala }}>
        <Mural folgas={folgas} solicitacoes={solicitacoes} hoje={hoje} tv />
      </div>
    </div>
  );
}
