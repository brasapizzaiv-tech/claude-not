import { createClient } from "@/lib/supabase/server";
import { CotarPreencher, type LinhaPreco } from "./preencher";

export default async function CotarPublicoPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();

  const { data } = await supabase.rpc("cotar_fornecedor_dados", {
    p_token: token,
  });

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-6 dark:bg-zinc-950">
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
            Link inválido
          </h1>
          <p className="mt-2 text-zinc-500">
            Este link não é válido ou foi removido. Peça um novo ao comprador.
          </p>
        </div>
      </div>
    );
  }

  const produtos = (data.produtos as LinhaPreco[]) ?? [];
  const outros = (data.outros as LinhaPreco[]) ?? [];

  return (
    <CotarPreencher
      token={token}
      descricao={data.cotacao?.descricao ?? "Cotação"}
      fornecedor={data.fornecedor ?? ""}
      prazo={data.cotacao?.prazo ?? null}
      fechada={data.cotacao?.status === "fechada"}
      produtos={produtos}
      outros={outros}
      meta={{
        prazo_entrega: data.prazo_entrega ?? "",
        pedido_minimo: data.pedido_minimo != null ? String(data.pedido_minimo) : "",
        condicao_pagamento: data.condicao_pagamento ?? "",
        observacao: data.observacao ?? "",
        promocao_texto: data.promocao_texto ?? "",
        promocao_foto: data.promocao_foto ?? "",
      }}
    />
  );
}
