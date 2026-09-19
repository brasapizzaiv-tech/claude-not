"use client";
import { Icone } from "@/components/icone";
import { confirmar } from "@/components/dialogo";

// Saladas do dia: marca na base quais entram no buffet de saladas de um dia.
// Aparece na TV da cozinha (página "Saladas do dia"). A base cresce aqui
// mesmo ("+ nova salada"); tirar da base não apaga os dias antigos.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { criarSalada, removerSalada, salvarPadraoSemanaSaladas, salvarSaladasDia } from "./saladas-actions";
import { CATEGORIAS_SALADA, type CategoriaSalada, type SaladaBase } from "./saladas-tipos";

const DIA_NOME = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

export function SaladasDoDia({ dia, dow, base, marcadas, padrao }: { dia: string; dow: number; base: SaladaBase[]; marcadas: string[]; padrao: string[] }) {
  const router = useRouter();
  // Sem marcação própria do dia, a tela começa pelo padrão do dia da semana.
  const temExcecao = marcadas.length > 0;
  const [sel, setSel] = useState<Set<string>>(() => new Set(temExcecao ? marcadas : padrao));
  const [sujo, setSujo] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [novo, setNovo] = useState("");
  const [cat, setCat] = useState<CategoriaSalada>("Folhas");
  const [gerenciar, setGerenciar] = useState(false);
  const [proc, start] = useTransition();

  const porCategoria = CATEGORIAS_SALADA.map((c) => ({ categoria: c, itens: base.filter((s) => s.categoria === c) })).filter((g) => g.itens.length > 0);

  function alternar(id: string) {
    setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    setSujo(true);
  }
  function salvar() {
    setMsg(null);
    start(async () => {
      const r = await salvarSaladasDia(dia, [...sel]);
      if (!r.ok) { setMsg(r.mensagem); return; }
      setSujo(false);
      setMsg(`✓ ${sel.size} salada(s) marcada(s) pra ${dia.split("-").reverse().join("/")}.`);
      router.refresh();
    });
  }
  async function salvarPadrao() {
    if (!await confirmar(`Gravar esta seleção como o padrão de toda ${DIA_NOME[dow]}?`)) return;
    setMsg(null);
    start(async () => {
      const r = await salvarPadraoSemanaSaladas(dow, [...sel]);
      if (!r.ok) { setMsg(r.mensagem); return; }
      setSujo(false);
      setMsg(`✓ Padrão de ${DIA_NOME[dow]} gravado (${sel.size} saladas).`);
      router.refresh();
    });
  }
  function voltarPadrao() {
    start(async () => {
      await salvarSaladasDia(dia, []);
      setSel(new Set(padrao));
      setSujo(false);
      setMsg(`Voltou ao padrão de ${DIA_NOME[dow]}.`);
      router.refresh();
    });
  }
  function adicionar() {
    setMsg(null);
    start(async () => {
      const r = await criarSalada(novo, cat);
      if (!r.ok) { setMsg(r.mensagem); return; }
      setNovo("");
      setSel((s) => new Set(s).add(r.id)); // já entra marcada no dia
      setSujo(true);
      router.refresh();
    });
  }

  const chip = (on: boolean) =>
    `rounded-full border px-3 py-1.5 text-sm font-medium transition ${
      on ? "border-green-600 bg-texto text-fundo" : "border-borda-forte bg-painel-cartao text-texto-suave hover:border-zinc-400   "
    }`;

  return (
    <div className="mx-auto max-w-6xl px-8 pb-10">
      <div className="rounded-cartao border border-borda p-5">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-texto"><Icone nome="salada" tamanho={17} className="mr-1.5" /> Saladas do dia</h2>
          <button onClick={() => setGerenciar((g) => !g)} className="text-xs text-texto-suave underline">
            {gerenciar ? "fechar edição da base" : "editar a base (tirar saladas)"}
          </button>
        </div>
        <p className="mb-4 text-sm text-texto-suave">
          Marque o que vai no buffet de saladas deste dia. Aparece na TV da cozinha. <span className="font-medium">{sel.size}</span> marcada(s).
          {temExcecao
            ? <> · <span className="font-medium text-amber-600">este dia tem seleção própria</span> (<button type="button" onClick={voltarPadrao} disabled={proc} className="underline">voltar ao padrão de {DIA_NOME[dow]}</button>)</>
            : <> · seguindo o <span className="font-medium">padrão de {DIA_NOME[dow]}</span></>}
        </p>

        <div className="space-y-3">
          {porCategoria.map((g) => (
            <div key={g.categoria}>
              <p className="mb-1.5 text-mini font-semibold text-texto-fraco">{g.categoria}</p>
              <div className="flex flex-wrap gap-1.5">
                {g.itens.map((s) => (
                  <span key={s.id} className="inline-flex items-center gap-1">
                    <button type="button" onClick={() => alternar(s.id)} className={chip(sel.has(s.id))} disabled={proc}>
                      {sel.has(s.id) ? "✓ " : ""}{s.nome}
                    </button>
                    {gerenciar && (
                      <button
                        type="button"
                        title="Tirar da base"
                        disabled={proc}
                        onClick={async () => { if (await confirmar(`Tirar "${s.nome}" da base de saladas?`)) start(async () => { await removerSalada(s.id); router.refresh(); }); }}
                        className="text-xs text-texto-fraco hover:text-red-600"
                      >
                        ✕
                      </button>
                    )}
                  </span>
                ))}
              </div>
            </div>
          ))}
          {porCategoria.length === 0 && <p className="text-sm text-texto-fraco">A base está vazia — cadastre a primeira salada abaixo.</p>}
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-borda pt-4">
          <div>
            <label className="mb-1 block text-xs text-texto-suave">+ nova salada</label>
            <input
              value={novo}
              onChange={(e) => setNovo(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); adicionar(); } }}
              placeholder="Ex.: Mix de folhas"
              className="w-56 min-h-11 rounded-controle border border-borda-forte bg-transparent px-3 text-sm text-texto focus:border-primaria"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-texto-suave">Categoria</label>
            <select value={cat} onChange={(e) => setCat(e.target.value as CategoriaSalada)} className="rounded-controle border border-borda-forte bg-painel-cartao px-3 py-2 text-sm text-texto">
              {CATEGORIAS_SALADA.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <button type="button" onClick={adicionar} disabled={proc || novo.trim().length < 2} className="rounded-controle border border-borda-forte px-3 py-2 text-sm font-semibold disabled:opacity-40">
            Adicionar
          </button>
          <div className="flex-1" />
          <button type="button" onClick={salvarPadrao} disabled={proc || !sujo} className="rounded-controle border border-green-600 px-3 py-2 text-sm font-semibold text-green-700 disabled:opacity-40 dark:text-green-400">
            Gravar como padrão de {DIA_NOME[dow]}
          </button>
          <button type="button" onClick={salvar} disabled={proc || !sujo} className="rounded-controle bg-texto px-4 py-2 text-sm font-semibold text-fundo disabled:opacity-40">
            {proc ? "..." : "Salvar só para este dia"}
          </button>
        </div>
        {msg && <p className="mt-2 text-xs text-texto-suave">{msg}</p>}
      </div>
    </div>
  );
}
