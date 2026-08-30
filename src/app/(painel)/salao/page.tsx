import { createClient } from "@/lib/supabase/server";
import { MesasGrid, type Mesa, type ComandaMini } from "./mesas";

export default async function SalaoPage() {
  const supabase = await createClient();
  const [{ data: abertas }, { data: cfgRows }] = await Promise.all([
    supabase
      .from("pdv_comandas")
      .select("id, numero, mesa, valor_buffet")
      .eq("status", "aberta")
      .order("numero", { ascending: true }),
    supabase.from("pdv_config").select("chave, valor"),
  ]);

  const cfg: Record<string, string> = {};
  for (const r of cfgRows ?? []) cfg[r.chave] = r.valor;
  const qtdMesas = Number(cfg.qtd_mesas || 40);

  const todasAbertas =
    (abertas as { id: string; numero: number; mesa: string | null; valor_buffet: number }[]) ?? [];

  // Comandas de delivery têm painel próprio (/delivery) — não entram no salão.
  let comandas = todasAbertas;
  if (todasAbertas.length) {
    const { data: dels } = await supabase
      .from("delivery_pedidos")
      .select("comanda_id")
      .in("comanda_id", todasAbertas.map((c) => c.id));
    const delIds = new Set((dels ?? []).map((d) => d.comanda_id as string));
    if (delIds.size) comandas = todasAbertas.filter((c) => !delIds.has(c.id));
  }

  // soma dos itens por comanda
  const ids = comandas.map((c) => c.id);
  const totItens = new Map<string, number>();
  if (ids.length) {
    const { data: itens } = await supabase
      .from("pdv_comanda_itens")
      .select("comanda_id, qtd, preco_unit")
      .in("comanda_id", ids);
    for (const it of itens ?? []) {
      const v = Number(it.qtd) * Number(it.preco_unit);
      totItens.set(it.comanda_id, (totItens.get(it.comanda_id) || 0) + v);
    }
  }

  // agrupa comandas abertas por mesa
  const porMesa = new Map<string, ComandaMini[]>();
  for (const c of comandas) {
    const nome = c.mesa || "Balcão";
    const total = Number(c.valor_buffet) + (totItens.get(c.id) || 0);
    porMesa.set(nome, [...(porMesa.get(nome) ?? []), { id: c.id, numero: c.numero, total }]);
  }

  // monta a lista fixa de mesas: Balcão, Mesa 1..N, Balança
  const nomes: { nome: string; tipo: Mesa["tipo"] }[] = [
    { nome: "Balcão", tipo: "balcao" },
    ...Array.from({ length: qtdMesas }, (_, i) => ({
      nome: `Mesa ${i + 1}`,
      tipo: "mesa" as const,
    })),
    { nome: "Balança", tipo: "balanca" },
  ];
  const mesas: Mesa[] = nomes.map((m) => ({
    ...m,
    comandas: porMesa.get(m.nome) ?? [],
  }));

  // comandas de mesas fora da lista (ex.: a mesa foi reduzida) — não somem
  for (const [nome, cs] of porMesa) {
    if (!mesas.some((m) => m.nome === nome)) {
      mesas.push({ nome, tipo: "mesa", comandas: cs });
    }
  }

  return (
    <div className="mx-auto max-w-[1500px] p-6">
      <h1 className="mb-4 text-2xl font-bold text-zinc-900 dark:text-zinc-50">Salão</h1>
      <MesasGrid mesas={mesas} />
    </div>
  );
}
