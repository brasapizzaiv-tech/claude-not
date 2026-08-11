import { createAdminClient } from "@/lib/supabase/admin";
import type { Produto } from "@/lib/types";
import { PreencherClient } from "./preencher";

export default async function ContarPublicoPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data: link } = await admin
    .from("contagem_links")
    .select("contagem_id, colaborador_id")
    .eq("token", token)
    .maybeSingle();

  if (!link) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-6 dark:bg-zinc-950">
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
            Link inválido
          </h1>
          <p className="mt-2 text-zinc-500">
            Este link não é válido ou foi removido. Peça um novo ao responsável.
          </p>
        </div>
      </div>
    );
  }

  const [{ data: contagem }, { data: colaborador }, { data: atrib }] =
    await Promise.all([
      admin
        .from("contagens")
        .select("descricao, status")
        .eq("id", link.contagem_id)
        .single(),
      admin
        .from("colaboradores")
        .select("nome")
        .eq("id", link.colaborador_id)
        .single(),
      admin
        .from("contagem_atribuicoes")
        .select("categoria_id")
        .eq("contagem_id", link.contagem_id)
        .eq("colaborador_id", link.colaborador_id),
    ]);

  const categoriaIds = (atrib ?? []).map((a) => a.categoria_id);

  const [{ data: produtos }, { data: itens }] = await Promise.all([
    admin
      .from("produtos")
      .select("id, nome, unidade, estoque_minimo, categoria_id, categorias(nome)")
      .eq("ativo", true)
      .in("categoria_id", categoriaIds.length ? categoriaIds : ["-"])
      .order("nome"),
    admin
      .from("contagem_itens")
      .select("produto_id, qtd_estoque, qtd_pedir")
      .eq("contagem_id", link.contagem_id),
  ]);

  return (
    <PreencherClient
      token={token}
      descricao={contagem?.descricao ?? "Contagem"}
      colaborador={colaborador?.nome ?? ""}
      finalizada={contagem?.status === "finalizada"}
      produtos={(produtos as unknown as Produto[]) ?? []}
      itens={
        (itens as { produto_id: string; qtd_estoque: number; qtd_pedir: number }[]) ??
        []
      }
    />
  );
}
