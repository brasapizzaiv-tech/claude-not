import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { FolgaApp } from "./app";
import type { Pedido } from "@/lib/folgas";

export const metadata: Metadata = {
  title: "Minhas folgas · Brasa",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Folgas" },
};

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-6 dark:bg-zinc-950">
      <div className="w-full max-w-sm rounded-3xl border border-zinc-200 bg-white p-6 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        {children}
      </div>
    </div>
  );
}

export default async function FolgaTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data: eu } = await admin
    .from("folgas_funcionarios")
    .select("id, nome, grupo, vinculo, funcao, dias, grupo2, dias2, ativo")
    .eq("token", token)
    .maybeSingle();

  if (!eu || !eu.ativo) {
    return (
      <Moldura>
        <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">Link inválido</h1>
        <p className="mt-2 text-sm text-zinc-500">Peça um novo link ao responsável.</p>
      </Moldura>
    );
  }

  const hojeIso = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

  const [{ data: funcs }, { data: futuros }, { data: li }, { data: aj }, { data: bl }, { data: meus }] =
    await Promise.all([
      admin.from("folgas_funcionarios").select("id, grupo, grupo2"),
      admin.from("folgas_pedidos").select("funcionario_id, data, status, grupo_alvo").gte("data", hojeIso),
      admin.from("folgas_limites").select("*"),
      admin.from("folgas_ajustes").select("*"),
      admin.from("folgas_bloqueios").select("*"),
      admin.from("folgas_pedidos").select("*").eq("funcionario_id", eu.id).order("data"),
    ]);

  // Vagas ocupadas por data|grupo (sem revelar quem) — contagem no servidor.
  const grupoDe = new Map((funcs ?? []).map((f) => [f.id, { grupo: f.grupo, grupo2: f.grupo2 }]));
  const counts: Record<string, number> = {};
  for (const p of (futuros as { funcionario_id: number; data: string; status: string; grupo_alvo: string | null }[]) ?? []) {
    if (p.status === "Negado") continue;
    const f = grupoDe.get(p.funcionario_id);
    if (!f) continue;
    const grupos = p.grupo_alvo ? [p.grupo_alvo] : [f.grupo, f.grupo2].filter(Boolean);
    for (const g of grupos) counts[`${p.data}|${g}`] = (counts[`${p.data}|${g}`] ?? 0) + 1;
  }

  return (
    <FolgaApp
      token={token}
      eu={{
        nome: eu.nome,
        grupo: eu.grupo,
        grupo2: eu.grupo2,
        dias: eu.dias,
        dias2: eu.dias2,
      }}
      counts={counts}
      limitesRows={(li as { grupo: string; dia_semana: number; limite: number | null }[]) ?? []}
      ajustesRows={(aj as { data: string; grupo: string; limite: number }[]) ?? []}
      bloqueiosRows={(bl as { data: string; motivo: string }[]) ?? []}
      meus={(meus as Pedido[]) ?? []}
      hojeIso={hojeIso}
    />
  );
}
