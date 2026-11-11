"use client";

import { Icone } from "@/components/icone";
import { LeitorQr } from "@/components/leitor-qr";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { consultarEtiquetaColab, consultarEtiquetaPorNumeroColab, darBaixaLoteColab } from "../etiqueta-actions";

type Item = { id: string; produto: string; numero: number };
type Consulta = { ok: true; id: string; numero: number; produto: string; status: string } | { ok: false; mensagem: string };

// Baixa em lote das etiquetas pelo app da equipe. A câmera é o leitor único do
// sistema (components/leitor-qr); aqui ficam só a lista e a ação.
export function BaixaScanner({ token }: { token: string }) {
  const [status, setStatus] = useState<"usada" | "descartada">("usada");
  const [flash, setFlash] = useState<string | null>(null);
  const [lista, setLista] = useState<Item[]>([]);
  const [proc, start] = useTransition();
  const [feito, setFeito] = useState<string | null>(null);
  const [numero, setNumero] = useState("");
  const [manual, setManual] = useState(false);

  const listaRef = useRef<Item[]>([]);
  useEffect(() => { listaRef.current = lista; }, [lista]);
  const ocupadoRef = useRef(false);

  function aviso(txt: string) {
    setFlash(txt);
    setTimeout(() => setFlash(null), 1500);
  }

  const tratar = useCallback((r: Consulta) => {
    if (r.ok && r.status === "ativa") {
      setLista((l) => (l.some((x) => x.id === r.id) ? l : [{ id: r.id, produto: r.produto, numero: r.numero }, ...l]));
      aviso(`+ ${r.produto}`);
      if (navigator.vibrate) navigator.vibrate(90);
    } else if (r.ok) {
      aviso(`Nº ${r.numero} já estava "${r.status}"`);
    } else {
      aviso(r.mensagem || "Não encontrada");
    }
  }, []);

  // O leitor já segura o mesmo código por 3 s; aqui segura enquanto consulta.
  const aoLer = useCallback((valor: string) => {
    const id = valor.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
    if (!id) return;
    if (ocupadoRef.current) return;
    if (listaRef.current.some((x) => x.id === id)) { aviso("Já está na lista"); return; }
    ocupadoRef.current = true;
    (async () => {
      tratar(await consultarEtiquetaColab(token, id));
      setTimeout(() => { ocupadoRef.current = false; }, 600);
    })();
  }, [token, tratar]);

  function adicionarPorNumero() {
    const n = Number(numero.replace(/\D/g, ""));
    if (!n) return;
    start(async () => {
      tratar(await consultarEtiquetaPorNumeroColab(token, n));
      setNumero("");
    });
  }

  const remover = (id: string) => setLista((l) => l.filter((x) => x.id !== id));

  function darBaixa() {
    if (!lista.length) return;
    const ids = lista.map((x) => x.id);
    start(async () => {
      const r = await darBaixaLoteColab(token, ids, status);
      if (r.ok) {
        setFeito(`✓ ${r.quantidade} etiqueta(s) marcada(s) como ${status}!`);
        setLista([]);
        setTimeout(() => setFeito(null), 3000);
      } else {
        aviso(r.mensagem || "Erro");
      }
    });
  }

  return (
    <>
      <LeitorQr
        titulo="Dar baixa em lote"
        aoLer={aoLer}
        voltar={<Link href={`/eu/${token}`} className="flex min-h-11 items-center text-sm text-zinc-300">← Voltar</Link>}
        aviso={flash}
        mensagem={lista.length === 0 ? "Aponte para o QR da etiqueta…" : "Continue lendo as etiquetas…"}
        acima={
          <div className="flex gap-2">
            <button onClick={() => setStatus("usada")} aria-pressed={status === "usada"} className={`min-h-11 flex-1 rounded-controle text-sm font-bold ${status === "usada" ? "bg-emerald-600" : "bg-zinc-800"}`}>Usada</button>
            <button onClick={() => setStatus("descartada")} aria-pressed={status === "descartada"} className={`min-h-11 flex-1 rounded-controle text-sm font-bold ${status === "descartada" ? "bg-red-600" : "bg-zinc-800"}`}>Descartada</button>
          </div>
        }
        acoes={
          <button onClick={() => setManual((v) => !v)} aria-expanded={manual} className="min-h-11 flex-1 rounded-controle bg-zinc-800 text-sm font-semibold">
            <span className="inline-flex items-center justify-center gap-1.5"><Icone nome="teclado" tamanho={14} /> Digitar o nº</span>
          </button>
        }
        rodape={
          <button
            onClick={darBaixa}
            disabled={proc || lista.length === 0}
            className={`w-full rounded-cartao py-3 text-base font-bold text-white disabled:opacity-40 ${status === "descartada" ? "bg-red-600" : "bg-emerald-600"}`}
          >
            {proc ? "Dando baixa..." : `✓ Dar baixa em ${lista.length} (${status})`}
          </button>
        }
      >
        {manual && (
          <div className="flex gap-2 pb-2">
            <input aria-label="Nº da etiqueta"
              inputMode="numeric"
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") adicionarPorNumero(); }}
              placeholder="Nº da etiqueta"
              className="min-h-11 flex-1 rounded-controle border border-zinc-700 bg-zinc-900 px-3 text-sm text-white"
            />
            <button onClick={adicionarPorNumero} disabled={proc || !numero.trim()} className="min-h-11 rounded-controle bg-zinc-700 px-4 text-sm font-semibold disabled:opacity-50">Adicionar</button>
          </div>
        )}
        {lista.length === 0 ? (
          <p className="mt-6 text-center text-sm text-zinc-400">Nenhuma etiqueta lida ainda.</p>
        ) : (
          <ul className="space-y-1.5 py-2">
            {lista.map((it) => (
              <li key={it.id} className="flex items-center justify-between gap-2 rounded-controle bg-zinc-900 px-3 py-2 text-sm">
                <span className="min-w-0 truncate">{it.produto} <span className="text-zinc-400">· Nº {it.numero}</span></span>
                <button aria-label={`Tirar ${it.produto} da lista`} onClick={() => remover(it.id)} className="flex h-11 w-11 shrink-0 items-center justify-center text-zinc-400">✕</button>
              </li>
            ))}
          </ul>
        )}
      </LeitorQr>

      {feito && (
        <div role="status" className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60">
          <div className="rounded-cartao bg-zinc-800 px-8 py-6 text-center text-white">
            <div className="mb-2 flex justify-center"><Icone nome="certo" tamanho={42} className="text-emerald-500" /></div>
            <p className="font-semibold">{feito}</p>
          </div>
        </div>
      )}
    </>
  );
}
