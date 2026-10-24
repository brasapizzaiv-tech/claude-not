"use client";

// Lista das sangrias com a categoria do financeiro (migration 0252): busca,
// marca várias e lança de uma vez; avisa quando já existe conta parecida.
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BotaoAcao } from "@/components/enviar";
import { avisar, confirmar } from "@/components/dialogo";
import type { CategoriaSangria } from "@/lib/sangria-financeiro";
import { desfazerSangria, lancarSangrias } from "./actions";

export type LinhaSangria = { id: string; descricao: string; valor: number; dia: string; categoria: string | null; parecido: string | null };

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const campo = "min-h-11 rounded-controle border border-borda-forte bg-painel-cartao px-3 text-sm text-texto";
const semAcento = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export function SangriasClient({ linhas, categorias, de }: { linhas: LinhaSangria[]; categorias: CategoriaSangria[]; de: string }) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [soSem, setSoSem] = useState(true);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [cat, setCat] = useState("");
  const maisUsadas = [...categorias].filter((c) => c.usos > 0).sort((a, b) => b.usos - a.usos).slice(0, 6);

  const q = semAcento(busca.trim());
  const visiveis = useMemo(
    () => linhas.filter((l) => (!soSem || !l.categoria) && (!q || semAcento(l.descricao).includes(q))),
    [linhas, soSem, q],
  );
  const semCategoria = linhas.filter((l) => !l.categoria);
  const totalSem = semCategoria.reduce((s, l) => s + l.valor, 0);
  const selecionaveis = visiveis.filter((l) => !l.categoria);
  const todasMarcadas = selecionaveis.length > 0 && selecionaveis.every((l) => marcadas.has(l.id));
  const somaMarcadas = linhas.filter((l) => marcadas.has(l.id)).reduce((s, l) => s + l.valor, 0);

  function alternar(id: string) {
    setMarcadas((m) => {
      const n = new Set(m);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  async function lancar() {
    if (!cat) { void avisar("Escolha a categoria."); return; }
    const comAviso = linhas.filter((l) => marcadas.has(l.id) && l.parecido).length;
    if (comAviso && !(await confirmar(`${comAviso} delas parecem já ter conta lançada no financeiro (mesmo valor, perto da data). Lançar mesmo assim?`))) return;
    const r = await lancarSangrias([...marcadas], cat);
    if (!r.ok) { void avisar(r.mensagem); return; }
    setMarcadas(new Set());
    router.refresh();
  }
  async function desfazer(id: string) {
    if (!(await confirmar("Tirar essa sangria do financeiro? A despesa criada por ela é apagada."))) return;
    await desfazerSangria(id);
    router.refresh();
  }

  return (
    <div className="mt-5 grid gap-4">
      <div className="w-fit rounded-cartao bg-destaque px-5 py-4">
        <p className="rotulo">Sem categoria (fora do DRE)</p>
        <p className="numero-grande text-[26px] text-texto">{brl(totalSem)}</p>
        <p className="text-xs text-texto-suave">{semCategoria.length} sangria{semCategoria.length === 1 ? "" : "s"} desde {de.split("-").reverse().join("/")}</p>
      </div>

      <div className="cartao flex flex-wrap items-end gap-3 p-4">
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar (ex.: motoboy, faxina)…" aria-label="Buscar" className={`${campo} min-w-[220px] flex-1`} />
        <label className="flex min-h-11 items-center gap-2 text-sm text-texto">
          <input type="checkbox" checked={soSem} onChange={(e) => setSoSem(e.target.checked)} className="h-5 w-5" /> Só as sem categoria
        </label>
        <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Categoria" className={`${campo} min-w-[240px]`}>
          <option value="">Categoria pras marcadas…</option>
          {maisUsadas.length > 0 && <optgroup label="Mais usadas">{maisUsadas.map((c) => <option key={"m" + c.id} value={c.id}>{c.nome}</option>)}</optgroup>}
          <optgroup label="Todas">{categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</optgroup>
        </select>
        <BotaoAcao aoClicar={lancar} disabled={marcadas.size === 0 || !cat} className="btn-principal !min-h-11 text-sm">
          {marcadas.size ? `Lançar ${marcadas.size} (${brl(somaMarcadas)})` : "Lançar marcadas"}
        </BotaoAcao>
      </div>

      <div className="cartao overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="rotulo text-left">
            <tr>
              <th className="w-12 px-4 py-3">
                <input type="checkbox" aria-label="Marcar todas" checked={todasMarcadas} onChange={() => setMarcadas(todasMarcadas ? new Set() : new Set(selecionaveis.map((l) => l.id)))} className="h-5 w-5" />
              </th>
              <th className="px-2 py-3">Dia</th>
              <th className="px-2 py-3">Motivo</th>
              <th className="px-2 py-3 text-right">Valor</th>
              <th className="px-4 py-3">Financeiro</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borda">
            {visiveis.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-texto-suave">Nada aqui.</td></tr>}
            {visiveis.map((l) => (
              <tr key={l.id} className={marcadas.has(l.id) ? "bg-destaque" : ""}>
                <td className="px-4 py-2">
                  {!l.categoria && <input type="checkbox" aria-label={`Marcar ${l.descricao}`} checked={marcadas.has(l.id)} onChange={() => alternar(l.id)} className="h-5 w-5" />}
                </td>
                <td className="whitespace-nowrap px-2 py-2 text-texto-suave">{l.dia.slice(8, 10)}/{l.dia.slice(5, 7)}</td>
                <td className="px-2 py-2 text-texto">
                  {l.descricao || "Sangria"}
                  {l.parecido && <span className="block text-xs text-amber-600">já tem conta parecida: {l.parecido}</span>}
                </td>
                <td className="px-2 py-2 text-right font-numero font-semibold text-texto">{brl(l.valor)}</td>
                <td className="px-4 py-2">
                  {l.categoria ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="pilula pilula-ok">{l.categoria}</span>
                      <BotaoAcao aoClicar={() => desfazer(l.id)} className="text-xs text-texto-fraco hover:text-urgente-texto">desfazer</BotaoAcao>
                    </span>
                  ) : (
                    <span className="text-xs text-texto-fraco">só retirada</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
