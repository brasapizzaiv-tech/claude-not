import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NovoUsuario, UsuarioLinha } from "./ui";

export default async function UsuariosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: meu } = await supabase
    .from("profiles")
    .select("papel")
    .eq("id", user.id)
    .single();
  if (meu?.papel !== "dono") redirect("/dashboard");

  const admin = createAdminClient();
  const [{ data: lista }, { data: profs }] = await Promise.all([
    admin.auth.admin.listUsers({ page: 1, perPage: 200 }),
    admin.from("profiles").select("id, nome, papel, permissoes"),
  ]);

  const perfilPorId = new Map(
    (
      (profs as {
        id: string;
        nome: string | null;
        papel: string;
        permissoes: string[] | null;
      }[]) ?? []
    ).map((p) => [p.id, p]),
  );

  const usuarios = (lista?.users ?? []).map((u) => {
    const perf = perfilPorId.get(u.id);
    return {
      id: u.id,
      nome: perf?.nome ?? (u.email as string) ?? "Sem nome",
      email: (u.email as string) ?? "",
      dono: perf?.papel === "dono",
      permissoes: perf?.permissoes ?? [],
      criado: u.created_at,
    };
  });
  usuarios.sort((a, b) => (a.criado < b.criado ? -1 : 1));

  return (
    <div className="mx-auto max-w-2xl p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          Usuários
        </h1>
        <p className="mt-1 text-zinc-500">
          Crie logins para os funcionários e escolha o que cada um pode acessar.
        </p>
      </div>

      <NovoUsuario />

      <div className="space-y-3">
        {usuarios.map((u) => (
          <UsuarioLinha key={u.id} usuario={u} souEu={u.id === user.id} />
        ))}
      </div>
    </div>
  );
}
