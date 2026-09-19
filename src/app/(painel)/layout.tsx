import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/sidebar";
import { CoresDaEmpresa } from "@/components/cores-da-empresa";
import { lerMarca } from "@/lib/marca";
import { ehTema, TEMA_PADRAO, type Tema } from "@/lib/tema";

// Hoje no fuso de Brasília (UTC−3, sem horário de verão).
function hojeBR() {
  return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

export default async function PainelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
    error: erroAuth,
  } = await supabase.auth.getUser();

  if (!user) {
    // Erro transitório do Auth (rede/limite/5xx) NÃO é "deslogado": mostra erro
    // em vez de jogar a pessoa no login (o middleware já deixou passar).
    if (erroAuth && !/session|jwt|token|refresh/i.test(`${erroAuth.name} ${erroAuth.message}`)) {
      throw new Error(`Login instável no momento (${erroAuth.message}). Recarregue a página.`);
    }
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("nome, papel, permissoes, tema")
    .eq("id", user.id)
    .single();

  const admin = profile?.papel === "dono";
  const permissoes = (profile?.permissoes as string[] | null) ?? [];
  // Aparência escolhida pela pessoa (claro / escuro / do aparelho). Vem do
  // perfil, e não do navegador, pra valer em qualquer aparelho onde ela entrar.
  const tema: Tema = ehTema(profile?.tema) ? profile.tema : TEMA_PADRAO;

  // Reservas de hoje em diante que ainda estão como "nova" ou "aguardando" —
  // vira o numerozinho no menu, para nenhuma passar batida.
  const marca = await lerMarca();
  const hoje = hojeBR();
  let reservasNovas = 0;
  if (admin || permissoes.includes("reservas")) {
    const { count } = await supabase
      .from("reservas")
      .select("id", { count: "exact", head: true })
      .gte("data", hoje)
      .in("status", ["nova", "aguardando"]);
    reservasNovas = count ?? 0;
  }

  // Pedidos de compra da equipe ainda não atendidos — numerozinho no menu.
  let pedidosCompra = 0;
  if (admin || permissoes.includes("solicitacoes")) {
    const { count } = await supabase
      .from("solicitacoes_compra")
      .select("id", { count: "exact", head: true })
      .eq("status", "pendente");
    pedidosCompra = count ?? 0;
  }

  return (
    <div className="flex min-h-full flex-1">
      <CoresDaEmpresa />
      <Sidebar
        nome={profile?.nome ?? user.email ?? "Usuário"}
        papel={admin ? "dono" : "funcionário"}
        admin={admin}
        permissoes={permissoes}
        reservasNovas={reservasNovas}
        pedidosCompra={pedidosCompra}
        tema={tema}
        logoUrl={marca.logoUrl}
      />
      <main className="flex-1 overflow-auto bg-painel-fundo">
        {children}
      </main>
    </div>
  );
}
