import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/sidebar";
import { CoresDaEmpresa } from "@/components/cores-da-empresa";
import { Dialogos } from "@/components/dialogo";
import { lerMarca } from "@/lib/marca";
import { empresaAtual } from "@/lib/empresa";
import { ehTema, TEMA_PADRAO, type Tema } from "@/lib/tema";
import { perfilDaSessao, usuarioDaSessao } from "@/lib/sessao";

// Hoje no fuso de Brasília (UTC−3, sem horário de verão).
function hojeBR() {
  return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

// Aba do navegador: o nome do restaurante (quem tem título próprio na página continua com o dele).
export async function generateMetadata() {
  const empresa = await empresaAtual().catch(() => null);
  // Cada tela põe só o nome dela; o sufixo é o da empresa (ACE-08, multiempresa).
  const nome = empresa?.nome ?? "Motelli";
  return { title: { template: `%s · ${nome}`, default: nome } };
}

export default async function PainelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  // Login e perfil uma vez só por requisição (DES-001): o título, a empresa e
  // o exigirAcesso da página reaproveitam.
  const { user, erro: erroAuth } = await usuarioDaSessao();

  if (!user) {
    // Erro transitório do Auth (rede/limite/5xx) NÃO é "deslogado": mostra erro
    // em vez de jogar a pessoa no login (o middleware já deixou passar).
    if (erroAuth && !/session|jwt|token|refresh/i.test(`${erroAuth.name} ${erroAuth.message}`)) {
      throw new Error(`Login instável no momento (${erroAuth.message}). Recarregue a página.`);
    }
    redirect("/login");
  }

  const profile = await perfilDaSessao();

  const admin = profile?.papel === "dono";
  const permissoes = (profile?.permissoes as string[] | null) ?? [];
  // Aparência escolhida pela pessoa (claro / escuro / do aparelho). Vem do
  // perfil, e não do navegador, pra valer em qualquer aparelho onde ela entrar.
  const tema: Tema = profile && ehTema(profile.tema) ? profile.tema : TEMA_PADRAO;

  // Reservas de hoje em diante que ainda estão como "nova" ou "aguardando" —
  // vira o numerozinho no menu, para nenhuma passar batida.
  const hoje = hojeBR();
  // Pedidos de compra da equipe ainda não atendidos — numerozinho no menu.
  // As três buscas ao mesmo tempo (antes uma esperava a outra).
  const [marca, reservasNovas, pedidosCompra] = await Promise.all([
    lerMarca(),
    admin || permissoes.includes("reservas")
      ? supabase.from("reservas").select("id", { count: "exact", head: true }).gte("data", hoje).in("status", ["nova", "aguardando"]).then((r) => r.count ?? 0)
      : Promise.resolve(0),
    admin || permissoes.includes("solicitacoes")
      ? supabase.from("solicitacoes_compra").select("id", { count: "exact", head: true }).eq("status", "pendente").then((r) => r.count ?? 0)
      : Promise.resolve(0),
  ]);

  return (
    <div className="flex min-h-full flex-1">
      <a
        href="#conteudo"
        className="absolute left-4 top-4 z-50 -translate-y-24 whitespace-nowrap rounded-controle bg-painel-foco-fundo px-4 py-3 text-sm font-semibold text-painel-foco-texto transition focus:translate-y-0"
      >
        Pular para o conteúdo
      </a>
      <CoresDaEmpresa />
      <Dialogos />
      <Sidebar
        nome={profile?.nome ?? user.email ?? "Usuário"}
        papel={admin ? "dono" : "funcionário"}
        admin={admin}
        permissoes={permissoes}
        reservasNovas={reservasNovas}
        pedidosCompra={pedidosCompra}
        tema={tema}
        logoUrl={marca.logoUrl}
        empresaNome={marca.nome}
      />
      <main id="conteudo" className="flex-1 overflow-auto bg-painel-fundo">
        {children}
      </main>
    </div>
  );
}
