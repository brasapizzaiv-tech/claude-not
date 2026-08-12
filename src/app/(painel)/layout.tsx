import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/sidebar";

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

  return (
    <div className="flex min-h-full flex-1">
      <Sidebar
        nome={profile?.nome ?? user.email ?? "Usuário"}
        papel={admin ? "dono" : "funcionário"}
        admin={admin}
        permissoes={(profile?.permissoes as string[] | null) ?? []}
      />
      <main className="flex-1 overflow-auto bg-zinc-50 dark:bg-zinc-950">
        {children}
      </main>
    </div>
  );
}
