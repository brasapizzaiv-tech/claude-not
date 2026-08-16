"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { criarContagemAvulsa } from "./actions";

type Item = { id: string; nome: string; whatsapp?: string | null };

export function AvulsaForm({
  categorias,
  colaboradores,
}: {
  categorias: Item[];
  colaboradores: Item[];
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [cats, setCats] = useState<string[]>([]);
  const [colab, setColab] = useState("");
  const [p, start] = useTransition();
  const [res, setRes] = useState<{ token: string; nome: string; whatsapp?: string | null } | null>(null);

  const toggle = (id: string) =>
    setCats((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  function criar() {
    if (!colab || cats.length === 0) return;
    start(async () => {
      const r = await criarContagemAvulsa(cats, colab);
      if (r.ok) {
        const col = colaboradores.find((c) => c.id === colab);
        setRes({ token: r.token, nome: col?.nome ?? "", whatsapp: col?.whatsapp });
        router.refresh();
      }
    });
  }

  function reset() {
    setRes(null);
    setCats([]);
    setColab("");
  }

  if (!aberto) {
    return (
      <button
        onClick={() => setAberto(true)}
        className="rounded-lg border border-orange-500 px-4 py-2 text-sm font-medium text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950"
      >
        ⚡ Contagem avulsa
      </button>
    );
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Contagem avulsa
          </h2>
          <button
            onClick={() => {
              setAberto(false);
              reset();
            }}
            className="text-zinc-400 hover:text-zinc-600"
          >
            ✕
          </button>
        </div>

        {res ? (
          <Resultado res={res} origin={origin} onNova={reset} />
        ) : (
          <>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Categorias a contar
            </label>
            <div className="mb-4 max-h-56 space-y-1 overflow-y-auto rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
              {categorias.map((c) => (
                <label
                  key={c.id}
                  className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300"
                >
                  <input
                    type="checkbox"
                    checked={cats.includes(c.id)}
                    onChange={() => toggle(c.id)}
                    className="h-4 w-4"
                  />
                  {c.nome}
                </label>
              ))}
            </div>

            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Colaborador
            </label>
            <select
              value={colab}
              onChange={(e) => setColab(e.target.value)}
              className="mb-4 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            >
              <option value="">escolha...</option>
              {colaboradores.map((col) => (
                <option key={col.id} value={col.id}>
                  {col.nome}
                </option>
              ))}
            </select>

            <button
              onClick={criar}
              disabled={p || !colab || cats.length === 0}
              className="w-full rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
            >
              {p ? "Criando..." : "Criar e gerar link"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Resultado({
  res,
  origin,
  onNova,
}: {
  res: { token: string; nome: string; whatsapp?: string | null };
  origin: string;
  onNova: () => void;
}) {
  const [copiado, setCopiado] = useState(false);
  const link = `${origin}/contar/${res.token}`;
  const zap = (res.whatsapp ?? "").replace(/\D/g, "");
  const zapNum = zap ? (zap.startsWith("55") ? zap : `55${zap}`) : "";
  const msg = encodeURIComponent(
    `Olá ${res.nome}! Segue o link para você fazer a contagem de estoque: ${link}`,
  );

  return (
    <div>
      <div className="mb-3 rounded-xl bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
        ✓ Contagem criada para <b>{res.nome}</b>. Envie o link:
      </div>
      <input
        readOnly
        value={link}
        onFocus={(e) => e.currentTarget.select()}
        className="mb-2 w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400"
      />
      <div className="flex gap-2">
        <button
          onClick={() => {
            navigator.clipboard?.writeText(link);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 1500);
          }}
          className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
        >
          {copiado ? "Copiado!" : "Copiar link"}
        </button>
        <a
          href={zapNum ? `https://wa.me/${zapNum}?text=${msg}` : `https://wa.me/?text=${msg}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 rounded-lg bg-green-600 px-3 py-2 text-center text-sm font-medium text-white hover:bg-green-700"
        >
          Enviar no WhatsApp
        </a>
      </div>
      <button
        onClick={onNova}
        className="mt-3 w-full rounded-lg px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
      >
        + Nova avulsa
      </button>
    </div>
  );
}
