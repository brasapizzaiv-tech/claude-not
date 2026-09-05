// Checagem de permissão DENTRO das server actions. O middleware só bloqueia a
// navegação entre páginas; uma action pode ser chamada direto por quem está
// logado em outra tela, então cada action sensível confere aqui também.
import { createClient } from "@/lib/supabase/server";
import { podeAcessar } from "@/lib/permissoes";

// rota: uma rota ou uma lista (basta ter acesso a UMA delas).
export async function exigirAcesso(rota: string | string[]) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Faça login de novo.");
  const { data: prof } = await supabase
    .from("profiles")
    .select("papel, permissoes")
    .eq("id", user.id)
    .maybeSingle();
  const admin = prof?.papel === "dono";
  const permissoes = (prof?.permissoes as string[] | null) ?? [];
  const rotas = Array.isArray(rota) ? rota : [rota];
  if (!rotas.some((r) => podeAcessar(r, admin, permissoes))) throw new Error("Sem permissão para esta ação.");
}
