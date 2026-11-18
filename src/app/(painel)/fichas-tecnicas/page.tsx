import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { exigirAcesso } from "@/lib/permissoes-server";
import { carregarFichas } from "@/lib/fichas";
import { Icone } from "@/components/icone";
import { NovaFicha } from "./nova-ficha";

export const metadata = { title: "Fichas técnicas" };
export const dynamic = "force-dynamic";

const brl = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const kg = (n: number | null) => (n == null ? "—" : `${n.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} kg`);

// Fichas técnicas (0320): o custo de cada prato com o preço de HOJE dos
// produtos (preço da última nota). A coluna de 2025 é o que a planilha dizia.
export default async function FichasPage({ searchParams }: { searchParams: Promise<{ q?: string; cat?: string; pend?: string; ordem?: string }> }) {
  await exigirAcesso("/fichas-tecnicas");
  const sp = await searchParams;
  const supabase = await createClient();
  const { fichas, custos } = await carregarFichas(supabase);

  // A busca é no banco (regra do sistema); o custo precisa de todas as fichas.
  const q = (sp.q ?? "").trim().slice(0, 60);
  let achadas: Set<string> | null = null;
  if (q) {
    const { data } = await supabase.from("fichas_tecnicas").select("id").eq("ativo", true).ilike("nome", `%${q.replace(/[%_,()]/g, " ")}%`).limit(500);
    achadas = new Set(((data as { id: string }[] | null) ?? []).map((r) => r.id));
  }
  const categorias = [...new Set(fichas.map((f) => f.categoria ?? "Sem categoria"))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const cat = sp.cat && categorias.includes(sp.cat) ? sp.cat : null;
  const soPend = sp.pend === "1";
  const porCusto = sp.ordem === "custo";

  const linhas = fichas
    .map((f) => ({ f, c: custos.get(f.id) }))
    .filter(({ f, c }) => (!achadas || achadas.has(f.id)) && (!cat || (f.categoria ?? "Sem categoria") === cat) && (!soPend || (c?.pendencias ?? 0) > 0))
    .sort((a, b) => (porCusto ? (b.c?.custoKg ?? -1) - (a.c?.custoKg ?? -1) : a.f.nome.localeCompare(b.f.nome, "pt-BR")));

  const comPend = fichas.filter((f) => (custos.get(f.id)?.pendencias ?? 0) > 0).length;
  const comCusto = fichas.filter((f) => custos.get(f.id)?.custoKg != null);
  const subiu = comCusto.filter((f) => f.custo_kg_planilha && custos.get(f.id)!.custoKg! > Number(f.custo_kg_planilha) * 1.1).length;

  const link = (mudar: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const atual: Record<string, string | null> = { q: q || null, cat, pend: soPend ? "1" : null, ordem: porCusto ? "custo" : null, ...mudar };
    for (const [k, v] of Object.entries(atual)) if (v) p.set(k, v);
    const s = p.toString();
    return `/fichas-tecnicas${s ? `?${s}` : ""}`;
  };
  const pilula = (ativo: boolean) => `inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold ${ativo ? "bg-texto text-painel-fundo" : "bg-painel-cartao text-texto shadow-sm"}`;

  return (
    <div className="pagina space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="titulo-pagina">Fichas técnicas</h1>
          <p className="mt-1 text-sm text-texto-suave">O custo de cada prato com o preço de hoje dos produtos (última nota de compra). A coluna de 2025 é o que a planilha antiga dizia.</p>
        </div>
        <NovaFicha />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="cartao-foco p-5">
          <span className="rotulo text-painel-foco-rotulo">Fichas com custo de hoje</span>
          <p className="numero-grande mt-1 text-4xl">{comCusto.length} <span className="text-lg font-semibold">de {fichas.length}</span></p>
        </div>
        <div className="cartao p-5">
          <span className="rotulo">Com ingrediente pra ligar</span>
          <p className="numero-grande mt-1 text-3xl text-texto">{comPend}</p>
          <p className="text-xs text-texto-suave">Ligue ao produto do estoque pra o preço acompanhar as notas.</p>
        </div>
        <div className="cartao p-5">
          <span className="rotulo">Mais de 10% acima de 2025</span>
          <p className="numero-grande mt-1 text-3xl text-texto">{subiu}</p>
          <p className="text-xs text-texto-suave">Comparado com o custo por kg da planilha.</p>
        </div>
      </div>

      <form className="flex flex-wrap items-center gap-2" action="/fichas-tecnicas">
        <input name="q" defaultValue={q} placeholder="Buscar ficha" aria-label="Buscar ficha" className="campo w-64" />
        {cat && <input type="hidden" name="cat" value={cat} />}
        {soPend && <input type="hidden" name="pend" value="1" />}
        {porCusto && <input type="hidden" name="ordem" value="custo" />}
        <button type="submit" className="btn-secundario px-4"><Icone nome="buscar" tamanho={16} /> Buscar</button>
        <Link href={link({ pend: soPend ? null : "1" })} className={pilula(soPend)}>Com pendência <span className={comPend ? "pilula-urgente-solido text-xs" : "rounded-full bg-superficie-suave px-2 text-xs"}>{comPend}</span></Link>
        <Link href={link({ ordem: porCusto ? null : "custo" })} className={pilula(porCusto)}>Mais caras primeiro</Link>
      </form>

      <div className="flex flex-wrap gap-2">
        <Link href={link({ cat: null })} className={pilula(!cat)}>Todas <span className={`rounded-full px-2 text-xs ${!cat ? "bg-primaria text-marca-sobre-primaria" : "bg-superficie-suave"}`}>{fichas.length}</span></Link>
        {categorias.map((c) => (
          <Link key={c} href={link({ cat: c })} className={pilula(cat === c)}>{c}</Link>
        ))}
      </div>

      <div className="cartao overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left">
              <th className="rotulo px-4 py-3">Ficha</th>
              <th className="rotulo px-4 py-3 text-right">Rende</th>
              <th className="rotulo px-4 py-3 text-right">R$/kg hoje</th>
              <th className="rotulo px-4 py-3 text-right">R$/kg 2025</th>
              <th className="rotulo px-4 py-3 text-right">Diferença</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map(({ f, c }) => {
              const hoje = c?.custoKg ?? null;
              const antes = f.custo_kg_planilha != null ? Number(f.custo_kg_planilha) : null;
              const dif = hoje != null && antes ? (hoje / antes - 1) * 100 : null;
              return (
                <tr key={f.id} className="border-t border-borda">
                  <td className="px-4 py-2.5">
                    <Link href={`/fichas-tecnicas/${f.id}`} className="font-semibold text-texto hover:text-texto-marca">{f.nome}</Link>
                    <p className="text-xs text-texto-fraco">
                      {f.categoria ?? "Sem categoria"}{f.base ? " · usada em outras fichas" : ""}
                      {(c?.pendencias ?? 0) > 0 && <span className="pilula-urgente ml-2">{c!.pendencias} pra ligar</span>}
                    </p>
                  </td>
                  <td className="font-numero px-4 py-2.5 text-right text-texto-suave">{kg(f.rendimento_kg != null ? Number(f.rendimento_kg) : null)}</td>
                  <td className="font-numero px-4 py-2.5 text-right font-semibold text-texto">{brl(hoje)}</td>
                  <td className="font-numero px-4 py-2.5 text-right text-texto-suave">{brl(antes)}</td>
                  <td className={`font-numero px-4 py-2.5 text-right ${dif == null ? "text-texto-fraco" : dif > 10 ? "text-urgente-texto" : dif < -10 ? "text-ok-texto" : "text-texto-suave"}`}>
                    {dif == null ? "—" : `${dif > 0 ? "+" : ""}${dif.toFixed(0)}%`}
                  </td>
                </tr>
              );
            })}
            {linhas.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-texto-suave">Nenhuma ficha aqui. Crie uma no botão &quot;Nova ficha&quot;, lá em cima.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
