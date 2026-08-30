"use client";

import { useRef, useState, useTransition } from "react";
import { salvarFotoCardapio, removerFotoCardapio, salvarDetalheCardapio, salvarFatias } from "../actions";

type ItemRow = { id: string; nome: string; categoria: string | null; preco: number; delivery: boolean; foto_url: string | null; descricao: string | null };
type TamRow = { id: string; nome: string; max_sabores: number; fatias: number | null };
type SaborRow = { id: string; nome: string; foto_url: string | null; descricao: string | null };

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const inputCls = "rounded-lg border border-zinc-300 bg-transparent px-2.5 py-1.5 text-sm outline-none dark:border-zinc-700";

function Foto({ url }: { url: string | null }) {
  if (!url) return <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-xl dark:bg-zinc-800">🍽️</div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" />;
}

// Botão de upload que envia a foto direto ao escolher o arquivo.
function UploadFoto({ tipo, id, temFoto }: { tipo: "item" | "sabor"; id: string; temFoto: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [proc, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const fd = new FormData();
          fd.set("tipo", tipo); fd.set("id", id); fd.set("foto", f);
          start(async () => {
            const r = await salvarFotoCardapio(fd);
            setMsg(r.ok ? null : r.mensagem ?? "Falhou");
            if (ref.current) ref.current.value = "";
          });
        }}
      />
      <div className="flex gap-1">
        <button type="button" onClick={() => ref.current?.click()} disabled={proc} className="rounded-lg border border-zinc-300 px-2 py-1 text-xs disabled:opacity-50 dark:border-zinc-700">
          {proc ? "Enviando..." : temFoto ? "📷 Trocar" : "📷 Foto"}
        </button>
        {temFoto && !proc && (
          <form action={removerFotoCardapio}>
            <input type="hidden" name="tipo" value={tipo} />
            <input type="hidden" name="id" value={id} />
            <button className="rounded-lg border border-zinc-300 px-2 py-1 text-xs text-rose-500 dark:border-zinc-700">✕</button>
          </form>
        )}
      </div>
      {msg && <span className="text-xs text-rose-500">{msg}</span>}
    </div>
  );
}

export function CardapioAppClient({ itens, categorias, tamanhos, sabores }: {
  itens: ItemRow[];
  categorias: string[];
  tamanhos: TamRow[];
  sabores: SaborRow[];
}) {
  const grupos = new Map<string, ItemRow[]>();
  for (const i of itens) {
    const k = i.categoria || "Sem categoria";
    grupos.set(k, [...(grupos.get(k) ?? []), i]);
  }
  const ordem = [...categorias.filter((c) => grupos.has(c)), ...[...grupos.keys()].filter((k) => !categorias.includes(k))];

  return (
    <div className="space-y-8">
      {/* Pizzas */}
      {tamanhos.length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-bold">🍕 Pizzas</h2>
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {tamanhos.map((t) => (
              <form key={t.id} action={salvarFatias} className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
                <input type="hidden" name="id" value={t.id} />
                <div className="text-sm font-semibold">{t.nome}</div>
                <div className="mb-2 text-xs text-zinc-500">{t.max_sabores} sabor{t.max_sabores > 1 ? "es" : ""}</div>
                <div className="flex items-center gap-1.5">
                  <input name="fatias" defaultValue={t.fatias ?? ""} inputMode="numeric" placeholder="Fatias" className={`${inputCls} w-20`} />
                  <button className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white">Ok</button>
                </div>
              </form>
            ))}
          </div>

          <h3 className="mb-2 font-semibold">Sabores (foto e descrição)</h3>
          <div className="space-y-2">
            {sabores.map((s) => (
              <div key={s.id} className="flex items-center gap-3 rounded-xl border border-zinc-200 p-2.5 dark:border-zinc-800">
                <Foto url={s.foto_url} />
                <form action={salvarDetalheCardapio} className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <input type="hidden" name="tipo" value="sabor" />
                  <input type="hidden" name="id" value={s.id} />
                  <div className="w-40 truncate text-sm font-medium">{s.nome}</div>
                  <input name="descricao" defaultValue={s.descricao ?? ""} maxLength={300} placeholder="Descrição (ingredientes)" className={`${inputCls} min-w-40 flex-1`} />
                  <button className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white">Salvar</button>
                </form>
                <UploadFoto tipo="sabor" id={s.id} temFoto={!!s.foto_url} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Itens por categoria */}
      {ordem.map((cat) => (
        <section key={cat}>
          <h2 className="mb-2 text-lg font-bold">{cat}</h2>
          <div className="space-y-2">
            {(grupos.get(cat) ?? []).map((i) => (
              <div key={i.id} className={`flex items-center gap-3 rounded-xl border p-2.5 ${i.delivery ? "border-zinc-200 dark:border-zinc-800" : "border-zinc-200 opacity-60 dark:border-zinc-800"}`}>
                <Foto url={i.foto_url} />
                <form action={salvarDetalheCardapio} className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <input type="hidden" name="tipo" value="item" />
                  <input type="hidden" name="id" value={i.id} />
                  <div className="w-40">
                    <div className="truncate text-sm font-medium">{i.nome}</div>
                    <div className="text-xs text-zinc-500">{i.preco > 0 ? brl(i.preco) : "—"}</div>
                  </div>
                  <input name="descricao" defaultValue={i.descricao ?? ""} maxLength={300} placeholder="Descrição no app" className={`${inputCls} min-w-40 flex-1`} />
                  <label className="flex shrink-0 items-center gap-1 text-xs text-zinc-500">
                    <input type="checkbox" name="delivery" defaultChecked={i.delivery} className="h-3.5 w-3.5" /> no app
                  </label>
                  <button className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white">Salvar</button>
                </form>
                <UploadFoto tipo="item" id={i.id} temFoto={!!i.foto_url} />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
