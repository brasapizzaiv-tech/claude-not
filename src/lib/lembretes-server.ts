import { createAdminClient } from "@/lib/supabase/admin";
import { lembretesDaPessoa, lerLembrete, ATRASADO_ATE_DIAS, type Lembrete } from "@/lib/lembretes-core";

// Leitura dos lembretes pro app da equipe (sem login: cliente administrativo,
// filtrado pela empresa do colaborador). Quem chama já conferiu token + PIN.

export function hojeSP(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

function diasAtras(dia: string, n: number): string {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d - n)).toISOString().slice(0, 10);
}

export type LembreteDoApp = { lembrete: Lembrete; dia: string; confirmado: boolean; atrasado: boolean; confirmadoEm: string | null };

export async function lembretesDoColaborador(colaboradorId: string): Promise<LembreteDoApp[]> {
  const admin = createAdminClient();
  const { data: colab } = await admin.from("colaboradores").select("id, empresa_id, checklist_setores, ativo").eq("id", colaboradorId).maybeSingle();
  if (!colab || !colab.ativo) return [];
  const hoje = hojeSP();
  const [{ data: ls }, { data: confs }] = await Promise.all([
    admin.from("lembretes").select("*").eq("empresa_id", colab.empresa_id).eq("ativo", true),
    admin.from("lembrete_confirmacoes").select("lembrete_id, dia, confirmado_em").eq("colaborador_id", colaboradorId).gte("dia", diasAtras(hoje, ATRASADO_ATE_DIAS)),
  ]);
  const quando = new Map<string, string>();
  for (const c of (confs ?? []) as { lembrete_id: string; dia: string; confirmado_em: string }[]) quando.set(`${c.lembrete_id}|${c.dia}`, c.confirmado_em);
  const lista = lembretesDaPessoa(
    ((ls ?? []) as Record<string, unknown>[]).map(lerLembrete),
    { id: colaboradorId, setores: (colab.checklist_setores as string[] | null) ?? [] },
    hoje,
    new Set(quando.keys()),
  );
  return lista.map((x) => ({ ...x, confirmadoEm: quando.get(`${x.lembrete.id}|${x.dia}`) ?? null }));
}
