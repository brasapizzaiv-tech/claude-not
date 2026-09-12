"use client";

// Fatura do cartão: sobe o arquivo, confere as compras uma a uma e lança.
// Cada compra vira um lançamento próprio, na sua categoria — a fatura inteira
// fica amarrada como um pagamento só pra conciliação do banco.
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Combobox } from "@/components/combobox";
import { lerFatura, lancarFatura, type CompraRevisada } from "./actions";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "");

type Cat = { id: string; nome: string; grupo: string };
type TransacaoFatura = { id: string; data: string; valor: number; descricao: string | null };

export function FaturaClient({
  categorias,
  bancos,
  transacoes,
}: {
  categorias: Cat[];
  bancos: string[];
  transacoes: TransacaoFatura[];
}) {
  const router = useRouter();
  const [proc, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<string | null>(null);
  const [compras, setCompras] = useState<CompraRevisada[] | null>(null);
  const [vencimento, setVencimento] = useState("");
  const [competencia, setCompetencia] = useState("");
  const [banco, setBanco] = useState(bancos[0] ?? "");
  const [pago, setPago] = useState(true);
  const [transacaoId, setTransacaoId] = useState("");
  const [totalImpresso, setTotalImpresso] = useState<number | null>(null);
  const [ignoradas, setIgnoradas] = useState(0);

  const input =
    "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

  function enviar(formData: FormData) {
    setErro(null);
    setFeito(null);
    start(async () => {
      const r = await lerFatura(formData);
      if (!r.ok) { setErro(r.erro); return; }
      setCompras(r.compras);
      setTotalImpresso(r.totalFatura);
      setIgnoradas(r.ignoradas);
      if (r.vencimento) {
        setVencimento(r.vencimento);
        setCompetencia(r.vencimento.slice(0, 7));
        // A fatura que vence neste mês costuma ser o débito do extrato.
        const perto = transacoes.find((t) => t.data.slice(0, 7) === r.vencimento!.slice(0, 7));
        if (perto) setTransacaoId(perto.id);
      }
    });
  }

  const total = useMemo(
    () => Math.round((compras ?? []).reduce((s, c) => s + c.valor, 0) * 100) / 100,
    [compras],
  );
  const semCategoria = (compras ?? []).filter((c) => !c.categoriaId).length;

  function mudarCategoria(uid: string, categoriaId: string) {
    setCompras((l) => (l ?? []).map((c) => (c.uid === uid ? { ...c, categoriaId, sugerida: false } : c)));
  }
  // Mesma categoria pra todas as compras do mesmo estabelecimento.
  function aplicarIguais(uid: string) {
    setCompras((l) => {
      const lista = l ?? [];
      const base = lista.find((c) => c.uid === uid);
      if (!base?.categoriaId) return lista;
      const chave = base.descricao.slice(0, 12).toUpperCase();
      return lista.map((c) =>
        c.descricao.slice(0, 12).toUpperCase() === chave ? { ...c, categoriaId: base.categoriaId, sugerida: false } : c,
      );
    });
  }
  function remover(uid: string) {
    setCompras((l) => (l ?? []).filter((c) => c.uid !== uid));
  }

  function lancar() {
    if (!compras) return;
    setErro(null);
    start(async () => {
      const r = await lancarFatura({
        compras: compras
          .filter((c) => c.categoriaId)
          .map((c) => ({ descricao: c.descricao, valor: c.valor, categoriaId: c.categoriaId!, data: c.data, parcela: c.parcela })),
        competencia,
        vencimento,
        banco: banco || null,
        pago,
        transacaoId: transacaoId || null,
      });
      if (!r.ok) { setErro(r.erro); return; }
      setFeito(`✓ ${r.total} compras lançadas. Da próxima fatura, esses estabelecimentos já vêm classificados.`);
      setCompras(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/* ---------- upload ---------- */}
      {!compras && (
        <form action={enviar} className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="mb-1 font-semibold text-zinc-900 dark:text-zinc-50">Fatura do cartão de crédito</p>
          <p className="mb-3 text-sm text-zinc-500">
            Baixe a fatura no aplicativo do banco (PDF ou CSV) e solte aqui. O sistema lista cada compra
            pra você conferir a categoria — depois lança tudo de uma vez.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="file"
              name="arquivo"
              accept=".pdf,.csv,.txt,application/pdf,text/csv,text/plain"
              required
              className="text-sm text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-orange-500 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-orange-600 dark:text-zinc-300"
            />
            <button
              type="submit"
              disabled={proc}
              className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-60 dark:bg-zinc-700"
            >
              {proc ? "Lendo..." : "Ler fatura"}
            </button>
          </div>
          <p className="mt-2 text-xs text-zinc-400">
            Fatura escaneada (foto) não dá pra ler — precisa ser o arquivo do banco.
          </p>
        </form>
      )}

      {erro && (
        <p className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          {erro}
        </p>
      )}
      {feito && (
        <p className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
          {feito}
        </p>
      )}

      {/* ---------- conferência ---------- */}
      {compras && (
        <>
          <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
            <div>
              <label className="mb-1 block text-xs text-zinc-500">Competência</label>
              <input type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)} className={input} />
              <p className="mt-0.5 max-w-[9rem] text-[10px] leading-tight text-zinc-400">mês da fatura (vai pro DRE)</p>
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-500">Vencimento</label>
              <input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} className={input} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-500">Banco</label>
              <select value={banco} onChange={(e) => setBanco(e.target.value)} className={input}>
                <option value="">—</option>
                {bancos.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-1.5 pb-2 text-sm text-zinc-600 dark:text-zinc-300">
              <input type="checkbox" checked={pago} onChange={(e) => setPago(e.target.checked)} /> já paguei
            </label>
            {transacoes.length > 0 && (
              <div className="min-w-64 flex-1">
                <label className="mb-1 block text-xs text-zinc-500">Conciliar com o débito da fatura</label>
                <select value={transacaoId} onChange={(e) => setTransacaoId(e.target.value)} className={`${input} w-full`}>
                  <option value="">— não conciliar agora</option>
                  {transacoes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {dataBR(t.data)} · {brl(Math.abs(t.valor))} · {(t.descricao ?? "").slice(0, 40)}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-4 rounded-xl bg-zinc-50 px-4 py-2.5 text-sm dark:bg-zinc-900">
            <span className="font-semibold text-zinc-800 dark:text-zinc-100">{compras.length} compras</span>
            <span className="text-zinc-500">soma <b className="text-zinc-800 dark:text-zinc-100">{brl(total)}</b></span>
            {totalImpresso != null && (
              <span className={Math.abs(totalImpresso - total) < 0.01 ? "text-emerald-600" : "text-amber-600"}>
                {Math.abs(totalImpresso - total) < 0.01
                  ? "✓ bate com o total da fatura"
                  : `⚠ a fatura diz ${brl(totalImpresso)} — diferença de ${brl(Math.abs(totalImpresso - total))}`}
              </span>
            )}
            {ignoradas > 0 && <span className="text-amber-600">{ignoradas} linha(s) não entendidas</span>}
            {semCategoria > 0 && <span className="text-amber-600">{semCategoria} sem categoria</span>}
          </div>

          <div className="overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
                <tr>
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Compra</th>
                  <th className="px-3 py-2">Categoria</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {compras.map((c) => (
                  <tr key={c.uid} className={c.categoriaId ? "" : "bg-amber-50/50 dark:bg-amber-950/10"}>
                    <td className="whitespace-nowrap px-3 py-2 text-zinc-500">{c.data ? dataBR(c.data) : c.dataTexto}</td>
                    <td className="px-3 py-2 text-zinc-800 dark:text-zinc-200">
                      {c.descricao}
                      {c.parcela && <span className="ml-1 rounded bg-zinc-200 px-1 text-[10px] text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">{c.parcela}</span>}
                      {c.sugerida && <span className="ml-1 text-[10px] text-emerald-600">já classificada antes</span>}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <div className="min-w-[190px]">
                          <Combobox
                            options={categorias.map((x) => ({ value: x.id, label: `${x.grupo} — ${x.nome}` }))}
                            value={c.categoriaId ?? ""}
                            onChange={(v) => mudarCategoria(c.uid, v)}
                            placeholder="Escolher..."
                            className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                          />
                        </div>
                        {c.categoriaId && (
                          <button
                            type="button"
                            onClick={() => aplicarIguais(c.uid)}
                            title="Usar esta categoria em todas as compras deste estabelecimento"
                            className="text-[11px] text-zinc-400 underline hover:text-orange-600"
                          >
                            iguais
                          </button>
                        )}
                      </div>
                    </td>
                    <td className={`whitespace-nowrap px-3 py-2 text-right font-medium ${c.valor < 0 ? "text-emerald-600" : "text-zinc-900 dark:text-zinc-100"}`}>
                      {brl(c.valor)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => remover(c.uid)} title="Tirar da lista" className="text-zinc-300 hover:text-red-600 dark:text-zinc-600">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={lancar}
              disabled={proc || semCategoria > 0 || !competencia}
              title={semCategoria > 0 ? "Escolha a categoria das compras em amarelo" : ""}
              className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {proc ? "Lançando..." : `Lançar ${compras.length} compras (${brl(total)})`}
            </button>
            <button onClick={() => { setCompras(null); setErro(null); }} className="text-sm text-zinc-500 underline">
              cancelar
            </button>
          </div>
        </>
      )}
    </div>
  );
}
