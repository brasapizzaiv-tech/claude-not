import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { BuscaComanda } from "./busca";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const quando = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

type ItRow = {
  descricao: string;
  qtd: number;
  preco_unit: number;
  criado_em: string;
  lancamento_id: string | null;
  criado_por: string | null;
  comanda_id: string;
};

type Grupo = {
  key: string;
  mesa: string;
  numero: number;
  quando: string;
  quem: string;
  total: number;
  itens: { desc: string; qtd: number; preco: number }[];
};

export default async function GarcomPage() {
  const supabase = await createClient();
  const [{ data: abertas }, { data: cfgRows }, { data: itRows }] = await Promise.all([
    supabase.from("pdv_comandas").select("id, numero, mesa").eq("status", "aberta").order("numero"),
    supabase.from("pdv_config").select("chave, valor"),
    supabase
      .from("pdv_comanda_itens")
      .select("descricao, qtd, preco_unit, criado_em, lancamento_id, criado_por, comanda_id")
      .order("criado_em", { ascending: false })
      .limit(150),
  ]);
  const cfg: Record<string, string> = {};
  for (const r of cfgRows ?? []) cfg[r.chave] = r.valor;
  const qtdMesas = Number(cfg.qtd_mesas || 40);

  const porMesa = new Map<string, number[]>();
  for (const c of (abertas as { numero: number; mesa: string | null }[]) ?? []) {
    const nome = c.mesa || "Balcão";
    porMesa.set(nome, [...(porMesa.get(nome) ?? []), c.numero]);
  }

  const nomes = ["Balcão", ...Array.from({ length: qtdMesas }, (_, i) => `Mesa ${i + 1}`), "Balança"];
  for (const nome of porMesa.keys()) if (!nomes.includes(nome)) nomes.push(nome);

  // Histórico geral de lançamentos (agrupado por pedido), com quem lançou.
  const items = (itRows as ItRow[]) ?? [];
  const comIds = [...new Set(items.map((i) => i.comanda_id))];
  const userIds = [...new Set(items.map((i) => i.criado_por).filter(Boolean))] as string[];
  const [{ data: comInfo }, { data: profs }] = await Promise.all([
    comIds.length
      ? supabase.from("pdv_comandas").select("id, numero, mesa").in("id", comIds)
      : Promise.resolve({ data: [] as { id: string; numero: number; mesa: string | null }[] }),
    userIds.length
      ? supabase.from("profiles").select("id, nome").in("id", userIds)
      : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
  ]);
  const comMap = new Map((comInfo ?? []).map((c) => [c.id, c]));
  const nomeMap = new Map((profs ?? []).map((p) => [p.id, p.nome]));

  const grupos: Grupo[] = [];
  const idx = new Map<string, Grupo>();
  for (const it of items) {
    const key = it.lancamento_id || `${it.comanda_id}|${it.criado_em}`;
    let g = idx.get(key);
    if (!g) {
      const c = comMap.get(it.comanda_id);
      g = {
        key,
        mesa: c?.mesa || "Balcão",
        numero: c?.numero ?? 0,
        quando: it.criado_em,
        quem: it.criado_por ? nomeMap.get(it.criado_por) || "—" : "",
        total: 0,
        itens: [],
      };
      idx.set(key, g);
      grupos.push(g);
    }
    g.itens.push({ desc: it.descricao, qtd: Number(it.qtd), preco: Number(it.preco_unit) });
    g.total += Number(it.qtd) * Number(it.preco_unit);
  }
  const historico = grupos.slice(0, 40);

  return (
    <div className="min-h-screen bg-zinc-950 p-2 text-zinc-100">
      <h1 className="px-1 py-2 text-xl font-bold">🧑‍🍳 Mesas</h1>
      <BuscaComanda mesas={nomes} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {nomes.map((nome) => {
          const comandas = porMesa.get(nome) ?? [];
          const ocupada = comandas.length > 0;
          return (
            <Link
              key={nome}
              href={`/garcom/mesa/${encodeURIComponent(nome)}`}
              className="flex min-h-[84px] flex-col rounded-lg border border-zinc-800 bg-zinc-900 p-2"
            >
              <span className={`rounded px-2 py-1 text-center text-sm font-bold ${ocupada ? "bg-red-400/90 text-red-950" : "bg-emerald-400/90 text-emerald-950"}`}>
                {nome}
              </span>
              {ocupada && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {comandas.map((n) => (
                    <span key={n} className="rounded bg-zinc-700 px-1.5 text-[11px] text-zinc-200">{n}</span>
                  ))}
                </div>
              )}
            </Link>
          );
        })}
      </div>

      {/* Histórico geral de lançamentos, em ordem (mais recentes primeiro) */}
      <h2 className="px-1 pb-2 pt-5 text-lg font-bold">🧾 Últimos lançamentos</h2>
      {historico.length === 0 ? (
        <p className="px-1 pb-6 text-sm text-zinc-500">Nenhum lançamento ainda.</p>
      ) : (
        <div className="space-y-2 pb-6">
          {historico.map((g) => (
            <div key={g.key} className="rounded-lg border border-zinc-800 bg-zinc-900 p-2.5">
              <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-zinc-100">
                  {g.mesa}
                  {g.numero ? ` · Comanda ${g.numero}` : ""}
                </span>
                <span className="shrink-0 text-zinc-400">
                  {g.quem ? `${g.quem} · ` : ""}
                  {quando(g.quando)}
                </span>
              </div>
              <div className="space-y-0.5 text-sm text-zinc-200">
                {g.itens.map((it, i) => (
                  <div key={i} className="flex justify-between gap-2">
                    <span className="min-w-0 flex-1 whitespace-pre-line">{it.qtd}× {it.desc}</span>
                    {it.preco > 0 && <span className="shrink-0 text-zinc-400">{brl(it.qtd * it.preco)}</span>}
                  </div>
                ))}
              </div>
              {g.total > 0 && (
                <div className="mt-1 border-t border-zinc-800 pt-1 text-right text-xs font-semibold text-emerald-400">
                  {brl(g.total)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
