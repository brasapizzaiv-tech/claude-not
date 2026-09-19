"use client";
import { Icone } from "@/components/icone";
import { confirmar } from "@/components/dialogo";

// Marmitas Kern de UM dia: mostra o que a rotação manda e deixa a cozinha
// trocar só esse dia (exceção). Usado no painel e no app da equipe — a ação
// de salvar vem de fora (cada lado confere a permissão do seu jeito).
// Quando a janela de pedidos já abriu (ou já tem pedido), fica só leitura.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { KernDia } from "@/lib/marmitas-cardapio";

export type ResultadoMarmita = { ok: true; removida: boolean } | { ok: false; mensagem: string };
export type PodeMarmita = { ok: true; abreEm: { data: string; hora: string } } | { ok: false; motivo: string; abreEm: { data: string; hora: string } };

const ddmm = (iso: string) => iso.split("-").reverse().slice(0, 2).join("/");

export function MarmitaDiaForm({
  dia, kern, pode, salvar, grande = false,
}: {
  dia: string;
  kern: KernDia | null;
  pode: PodeMarmita;
  salvar: (dia: string, dados: { pratos: string[]; proteinas: string[]; salada: string }) => Promise<ResultadoMarmita>;
  grande?: boolean; // celular na cozinha: letra e botões maiores
}) {
  const router = useRouter();
  const [proc, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [pratos, setPratos] = useState<string[]>(kern?.pratos ?? []);
  const [proteinas, setProteinas] = useState<string[]>(kern?.proteinas ?? []);
  const [salada, setSalada] = useState(kern?.salada ?? "");
  const [novoPrato, setNovoPrato] = useState("");
  const [novaProt, setNovaProt] = useState("");
  const [sujo, setSujo] = useState(false);

  const txt = grande ? "text-base" : "text-sm";
  const input = `${grande ? "h-12 text-base" : "h-9 text-sm"} w-full rounded-xl border border-zinc-300 bg-white px-3 text-zinc-900 focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100`;
  const chip = `${grande ? "px-4 py-2.5 text-base" : "px-3 py-1.5 text-sm"} inline-flex items-center gap-2 rounded-full bg-orange-100 font-medium text-orange-900 dark:bg-orange-500/20 dark:text-orange-100`;
  const editavel = pode.ok && !!kern && !kern.bloqueado;

  if (!kern) return <p className={`${txt} text-zinc-500`}>Cadastro das marmitas não encontrado.</p>;

  function tirar(lista: string[], set: (v: string[]) => void, i: number) {
    set(lista.filter((_, j) => j !== i));
    setSujo(true);
  }
  function addPrato() {
    const v = novoPrato.trim();
    if (!v) return;
    setPratos([...pratos, v]); setNovoPrato(""); setSujo(true);
  }
  function addProt() {
    const v = novaProt.trim();
    if (!v) return;
    setProteinas([...proteinas, v]); setNovaProt(""); setSujo(true);
  }
  function gravar() {
    setMsg(null);
    start(async () => {
      const r = await salvar(dia, { pratos, proteinas, salada });
      if (!r.ok) { setMsg(r.mensagem); return; }
      setSujo(false);
      setMsg(r.removida ? "✓ Voltou pro cardápio da rotação." : "✓ Marmita deste dia gravada. App do convênio e TV já mostram.");
      router.refresh();
    });
  }
  async function voltarRotacao() {
    if (!await confirmar("Voltar este dia pro cardápio da rotação?")) return;
    setMsg(null);
    start(async () => {
      const r = await salvar(dia, { pratos: [], proteinas: [], salada: "" });
      if (!r.ok) { setMsg(r.mensagem); return; }
      setPratos(kern!.rotacao.pratos); setProteinas(kern!.rotacao.proteinas); setSalada(kern!.rotacao.salada);
      setSujo(false);
      setMsg("✓ Voltou pro cardápio da rotação.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className={`${txt} flex flex-wrap items-center gap-x-3 gap-y-1 text-zinc-500`}>
        <span><b className="text-zinc-800 dark:text-zinc-100">{kern.quantidade}</b> pedido(s) · saem às <b className="text-zinc-800 dark:text-zinc-100">{kern.horaEntrega}</b></span>
        {kern.excecao
          ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">cardápio só deste dia</span>
          : <span className="text-xs">seguindo a rotação{kern.rotacao.semana ? ` (${kern.rotacao.semana})` : ""}</span>}
      </div>

      {kern.bloqueado && (
        <p className={`${txt} rounded-xl bg-zinc-100 px-3 py-2 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300`}>Sem marmita neste dia — {kern.bloqueado}.</p>
      )}

      {!pode.ok && !kern.bloqueado && (
        <p className={`${txt} rounded-xl bg-amber-50 px-3 py-2 text-amber-800 dark:bg-amber-950 dark:text-amber-200`}>
          <Icone nome="cadeado" tamanho={14} className="mr-1.5" /> {pode.motivo}
        </p>
      )}
      {pode.ok && !kern.bloqueado && (
        <p className="text-xs text-zinc-400">Dá pra mudar até {ddmm(pode.abreEm.data)} às {pode.abreEm.hora} (quando abrem os pedidos desse dia).</p>
      )}

      {/* Pratos */}
      <div>
        <p className="mb-1 text-mini font-semibold uppercase tracking-wide text-zinc-400">Pratos (a pessoa escolhe até 4)</p>
        <div className="flex flex-wrap gap-2">
          {pratos.map((p, i) => (
            <span key={i} className={chip}>
              {p}
              {editavel && <button type="button" onClick={() => tirar(pratos, setPratos, i)} className="text-orange-700 hover:text-red-600 dark:text-orange-200" aria-label="tirar">✕</button>}
            </span>
          ))}
          {pratos.length === 0 && <span className={`${txt} text-zinc-400`}>nenhum prato</span>}
        </div>
        {editavel && (
          <div className="mt-2 flex gap-2">
            <input value={novoPrato} onChange={(e) => setNovoPrato(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPrato(); } }} placeholder="+ prato" className={input} />
            <button type="button" onClick={addPrato} className={`${grande ? "h-12 px-5 text-base" : "h-9 px-3 text-sm"} shrink-0 rounded-xl bg-zinc-900 font-semibold text-white dark:bg-white dark:text-zinc-900`}>Add</button>
          </div>
        )}
      </div>

      {/* Proteínas */}
      <div>
        <p className="mb-1 text-mini font-semibold uppercase tracking-wide text-zinc-400">Proteínas (a pessoa escolhe uma)</p>
        <div className="flex flex-wrap gap-2">
          {proteinas.map((p, i) => (
            <span key={i} className={chip}>
              {p}
              {editavel && <button type="button" onClick={() => tirar(proteinas, setProteinas, i)} className="text-orange-700 hover:text-red-600 dark:text-orange-200" aria-label="tirar">✕</button>}
            </span>
          ))}
          {proteinas.length === 0 && <span className={`${txt} text-zinc-400`}>nenhuma</span>}
        </div>
        {editavel && (
          <div className="mt-2 flex gap-2">
            <input value={novaProt} onChange={(e) => setNovaProt(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addProt(); } }} placeholder="+ proteína" className={input} />
            <button type="button" onClick={addProt} className={`${grande ? "h-12 px-5 text-base" : "h-9 px-3 text-sm"} shrink-0 rounded-xl bg-zinc-900 font-semibold text-white dark:bg-white dark:text-zinc-900`}>Add</button>
          </div>
        )}
      </div>

      {/* Salada */}
      <div>
        <p className="mb-1 text-mini font-semibold uppercase tracking-wide text-zinc-400">Salada</p>
        {editavel
          ? <input value={salada} onChange={(e) => { setSalada(e.target.value); setSujo(true); }} placeholder="Ex.: Alface e tomate" className={input} />
          : <p className={txt}>{salada || <span className="text-zinc-400">—</span>}</p>}
      </div>

      {editavel && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button type="button" onClick={gravar} disabled={proc || !sujo} className={`${grande ? "h-12 px-6 text-base" : "h-9 px-4 text-sm"} rounded-xl bg-green-600 font-semibold text-white disabled:opacity-40`}>
            {proc ? "Gravando…" : "Gravar só este dia"}
          </button>
          {kern.excecao && (
            <button type="button" onClick={voltarRotacao} disabled={proc} className={`${grande ? "h-12 px-4 text-base" : "h-9 px-3 text-sm"} rounded-xl border border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300`}>
              Voltar pra rotação
            </button>
          )}
        </div>
      )}
      {msg && <p className={`${txt} text-zinc-600 dark:text-zinc-300`}>{msg}</p>}
    </div>
  );
}
