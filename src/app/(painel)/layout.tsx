import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/sidebar";

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
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("nome, papel, permissoes")
    .eq("id", user.id)
    .single();

  const admin = profile?.papel === "dono";
  const permissoes = (profile?.permissoes as string[] | null) ?? [];

  // Reservas de hoje em diante que ainda estão como "nova" ou "aguardando" —
  // vira o numerozinho no menu, para nenhuma passar batida.
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

  return (
    <div className="flex min-h-full flex-1">
      <Sidebar
        nome={profile?.nome ?? user.email ?? "Usuário"}
        papel={admin ? "dono" : "funcionário"}
        admin={admin}
        permissoes={permissoes}
        reservasNovas={reservasNovas}
      />
      <main className="flex-1 overflow-auto bg-zinc-50 dark:bg-zinc-950">
        {children}
      </main>
    </div>
  );
}
