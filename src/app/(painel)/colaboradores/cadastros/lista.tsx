"use client";

// Uma lista de cadastro (nome + quantas pessoas), com adicionar, renomear e apagar.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { BotaoAcao } from "@/components/enviar";
import { avisar, confirmar, perguntar } from "@/components/dialogo";
import { apagarItemCadastro, salvarItemCadastro, type TabelaCadastro } from "../[id]/actions";

export type ItemCadastro = { id: string; nome: string; pessoas: number };

export function ListaCadastro({ tabela, titulo, contagem, itens }: { tabela: TabelaCadastro; titulo: string; contagem: string; itens: ItemCadastro[] }) {
  const router = useRouter();
  const [novo, setNovo] = useState("");
  async function adicionar() {
    const r = await salvarItemCadastro(tabela, novo);
    if (!r.ok) { void avisar(r.erro); return; }
    setNovo("");
    router.refresh();
  }
  async function renomear(i: ItemCadastro) {
    const n = await perguntar(`Novo nome pra “${i.nome}”`, i.nome, { obrigatorio: true });
    if (n == null || n.trim() === i.nome) return;
    const r = await salvarItemCadastro(tabela, n, i.id);
    if (!r.ok) { void avisar(r.erro); return; }
    router.refresh();
  }
  async function apagar(i: ItemCadastro) {
    if (!(await confirmar(`Apagar “${i.nome}”?`, { detalhe: i.pessoas ? "Tem gente usando: ele sai das listas, mas o histórico continua." : undefined, perigo: true, okTexto: "Apagar" }))) return;
    const r = await apagarItemCadastro(tabela, i.id);
    if (!r.ok) { void avisar(r.erro); return; }
    router.refresh();
  }
  return (
    <section className="cartao flex flex-col p-4">
      <div className="mb-2 flex items-baseline justify-between"><p className="rotulo">{titulo}</p><p className="rotulo">{contagem}</p></div>
      <ul className="divide-y divide-borda text-sm">
        {itens.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-2 py-1.5">
            <button type="button" onClick={() => renomear(i)} className="min-h-11 flex-1 text-left font-semibold text-texto hover:underline" title="Renomear">{i.nome}</button>
            <span className="w-8 text-right font-numero text-texto-suave">{i.pessoas}</span>
            <BotaoAcao aoClicar={() => apagar(i)} className="min-h-11 px-2 text-xs text-texto-fraco hover:text-urgente-texto">apagar</BotaoAcao>
          </li>
        ))}
        {itens.length === 0 && <li className="py-3 text-texto-suave">Nada ainda.</li>}
      </ul>
      <div className="mt-auto flex gap-2 pt-3">
        <input value={novo} onChange={(e) => setNovo(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && novo.trim()) void adicionar(); }}
          placeholder="Novo…" aria-label={`Novo item em ${titulo}`} className="min-h-11 min-w-0 flex-1 rounded-controle border border-borda-forte bg-painel-cartao px-3 text-sm text-texto" />
        <BotaoAcao aoClicar={adicionar} disabled={!novo.trim()} className="btn-principal !min-h-11 shrink-0 text-sm">Adicionar</BotaoAcao>
      </div>
    </section>
  );
}
