import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Escolha a empresa · Cotação" };
export const dynamic = "force-dynamic";

// Link ÚNICO pro vendedor que representa várias empresas: ?e=token1,token2,...
// Ele escolhe pra qual empresa vai passar os preços — cada uma abre o
// formulário próprio (/cotar/{token}).
export default async function EscolherEmpresaPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string }>;
}) {
  const { e } = await searchParams;
  const tokens = (e ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter((t) => /^[0-9a-f]{16,64}$/i.test(t))
    .slice(0, 12);

  const admin = createAdminClient();
  const { data } = tokens.length
    ? await admin
        .from("cotacao_fornecedores")
        .select("token, status, respondido_em, fornecedores(nome), cotacoes(descricao, status)")
        .in("token", tokens)
    : { data: [] };

  const linhas = ((data as unknown as {
    token: string; status: string; respondido_em: string | null;
    fornecedores: { nome: string } | { nome: string }[] | null;
    cotacoes: { descricao: string | null; status: string } | { descricao: string | null; status: string }[] | null;
  }[]) ?? [])
    .map((r) => {
      const f = Array.isArray(r.fornecedores) ? r.fornecedores[0] : r.fornecedores;
      const c = Array.isArray(r.cotacoes) ? r.cotacoes[0] : r.cotacoes;
      return {
        token: r.token,
        empresa: f?.nome ?? "Empresa",
        respondido: r.status === "respondido",
        fechada: c?.status === "fechada",
        descricao: c?.descricao ?? "Cotação",
      };
    })
    // mantém a ordem do link
    .sort((a, b) => tokens.indexOf(a.token) - tokens.indexOf(b.token));

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4 dark:bg-zinc-950">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">Cotação — Brasa</h1>
        {linhas.length === 0 ? (
          <p className="mt-3 text-zinc-500">Link inválido ou vencido. Peça um novo ao comprador.</p>
        ) : (
          <>
            <p className="mt-1 text-sm text-zinc-500">{linhas[0].descricao}</p>
            <p className="mt-4 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Escolha a empresa pra passar os preços:
            </p>
            <div className="mt-3 space-y-2">
              {linhas.map((l) => (
                <Link
                  key={l.token}
                  href={`/cotar/${l.token}`}
                  className="flex items-center justify-between rounded-xl border border-zinc-200 px-4 py-3 font-semibold text-zinc-900 hover:border-orange-400 hover:bg-orange-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-orange-950"
                >
                  <span>🏢 {l.empresa}</span>
                  <span className={`text-xs font-medium ${l.respondido ? "text-green-600" : "text-zinc-400"}`}>
                    {l.fechada ? "fechada" : l.respondido ? "✅ enviada" : "pendente →"}
                  </span>
                </Link>
              ))}
            </div>
            <p className="mt-4 text-xs text-zinc-400">
              Você pode voltar aqui e preencher as outras quando quiser — cada empresa tem o seu formulário.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
