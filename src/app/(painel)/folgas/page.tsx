import { createClient } from "@/lib/supabase/server";
import { GestaoFolgas } from "./gestao-folgas";
import type { Funcionario, Pedido } from "@/lib/folgas";

export const metadata = { title: "Folgas · Brasa" };

export default async function FolgasPage() {
  const supabase = await createClient();
  const [{ data: eq }, { data: pe }, { data: li }, { data: aj }, { data: bl }] = await Promise.all([
    supabase.from("folgas_funcionarios").select("*").order("nome"),
    supabase.from("folgas_pedidos").select("*").order("data"),
    supabase.from("folgas_limites").select("*"),
    supabase.from("folgas_ajustes").select("*"),
    supabase.from("folgas_bloqueios").select("*"),
  ]);

  const hojeIso = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

  return (
    <GestaoFolgas
      equipe={(eq as Funcionario[]) ?? []}
      pedidos={(pe as Pedido[]) ?? []}
      limitesRows={(li as { grupo: string; dia_semana: number; limite: number | null }[]) ?? []}
      ajustesRows={(aj as { data: string; grupo: string; limite: number }[]) ?? []}
      bloqueiosRows={(bl as { data: string; motivo: string }[]) ?? []}
      hojeIso={hojeIso}
    />
  );
}
