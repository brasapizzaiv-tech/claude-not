import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

const brl = (n: number | null) =>
  (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataHora = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "—";

type Item = {
  tipo: "Comanda excluída" | "Item cancelado";
  quando: string | null;
  quem: string | null;
  descricao: string;
  valor: number | null;
  motivo: string;
};

export default async function CanceladosPage() {
  const supabase = await createClient();
  const [{ data: comandas }, { data: itens }] = await Promise.all([
    supabase
      .from("pdv_comandas_excluidas")
      .select("comanda_numero, mesa, valor, motivo, excluido_por, excluido_em")
      .order("excluido_em", { ascending: false })
      .limit(500),
    supabase
      .from("pdv_itens_cancelados")
      .select("comanda_numero, mesa, descricao, qtd, valor, motivo, cancelado_por, cancelado_em")
      .order("cancelado_em", { ascending: false })
      .limit(500),
  ]);

  const ids = [
    ...new Set([
      ...((comandas ?? []).map((c) => c.excluido_por as string | null)),
      ...((itens ?? []).map((i) => i.cancelado_por as string | null)),
    ].filter(Boolean) as string[]),
  ];
  const nomes = new Map<string, string>();
  if (ids.length) {
    const { data: profs } = await supabase.from("profiles").select("id, nome").in("id", ids);
    for (const p of profs ?? []) nomes.set(p.id as string, (p.nome as string) || "");
  }

  const lista: Item[] = [
    ...((comandas ?? []).map((c) => ({
      tipo: "Comanda excluída" as const,
      quando: c.excluido_em as string,
      quem: c.excluido_por ? nomes.get(c.excluido_por as string) ?? null : null,
      descricao: `Comanda #${c.comanda_numero ?? "?"}${c.mesa ? ` · ${c.mesa}` : ""}`,
      valor: c.valor as number | null,
      motivo: (c.motivo as string) || "",
    }))),
    ...((itens ?? []).map((i) => ({
      tipo: "Item cancelado" as const,
      quando: i.cancelado_em as string,
      quem: i.cancelado_por ? nomes.get(i.cancelado_por as string) ?? null : null,
      descricao: `${Number(i.qtd) > 1 ? `${i.qtd}× ` : ""}${i.descricao ?? "Item"} — Comanda #${i.comanda_numero ?? "?"}${i.mesa ? ` · ${i.mesa}` : ""}`,
      valor: i.valor as number | null,
      motivo: (i.motivo as string) || "",
    }))),
  ].sort((a, b) => String(b.quando).localeCompare(String(a.quando)));

  return (
    <div className="mx-auto max-w-4xl p-6">
      <Link href="/salao" className="text-sm text-zinc-500 hover:text-orange-600">← Salão</Link>
      <h1 className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-50">Cancelados / excluídos</h1>
      <p className="mt-1 text-sm text-zinc-500">Auditoria: comandas excluídas e itens cancelados, com o motivo, quem fez e quando.</p>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-400 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-2 font-medium">O quê</th>
              <th className="px-4 py-2 font-medium">Motivo</th>
              <th className="px-4 py-2 text-right font-medium">Valor</th>
              <th className="px-4 py-2 font-medium">Quem · quando</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {lista.map((l, idx) => (
              <tr key={idx} className="bg-white dark:bg-zinc-950">
                <td className="px-4 py-2">
                  <div className="font-medium text-zinc-800 dark:text-zinc-100">{l.descricao}</div>
                  <div className="text-[11px] uppercase text-zinc-400">{l.tipo}</div>
                </td>
                <td className="px-4 py-2 text-zinc-700 dark:text-zinc-300">{l.motivo}</td>
                <td className="px-4 py-2 text-right text-zinc-700 dark:text-zinc-300">{brl(l.valor)}</td>
                <td className="px-4 py-2 text-xs text-zinc-500">
                  {l.quem ? `${l.quem} · ` : ""}{dataHora(l.quando)}
                </td>
              </tr>
            ))}
            {lista.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-zinc-400">Nenhum cancelamento registrado.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
