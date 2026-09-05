import { createClient } from "@/lib/supabase/server";
import type { Produto } from "@/lib/types";
import { PreencherClient } from "./preencher";
import type { Referencia } from "@/lib/contagem-referencia";

type RpcProduto = {
  id: string;
  nome: string;
  unidade: string;
  categoria: string | null;
};

export default async function ContarPublicoPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();

  const [{ data }, { data: ref }] = await Promise.all([
    supabase.rpc("contar_dados", { p_token: token }),
    supabase.rpc("contar_referencia", { p_token: token }),
  ]);

  if (!data) {
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

  const produtos: Produto[] = ((data.produtos as RpcProduto[]) ?? []).map(
    (p) =>
      ({
        id: p.id,
        nome: p.nome,
        unidade: p.unidade,
        categorias: p.categoria ? { nome: p.categoria } : null,
      }) as Produto,
  );

  return (
    <PreencherClient
      token={token}
      descricao={data.contagem?.descricao ?? "Contagem"}
      colaborador={data.colaborador ?? ""}
      finalizada={data.contagem?.status === "finalizada"}
      produtos={produtos}
      itens={data.itens ?? []}
      referencia={(ref as Referencia[] | null) ?? []}
    />
  );
}
