"use client";
import { Icone } from "@/components/icone";

import { siteUrl } from "@/lib/site-url";
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
        className="rounded-controle border border-orange-500 px-4 py-2 text-sm font-medium text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950"
      >
        <Icone nome="rapido" tamanho={15} className="mr-1.5" /> Contagem avulsa
      </button>
    );
  }

  const origin = siteUrl();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-cartao bg-painel-cartao p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-texto">
            Contagem avulsa
          </h2>
          <button
            onClick={() => {
              setAberto(false);
              reset();
            }}
            className="text-texto-fraco hover:text-texto-suave"
          >
            ✕
          </button>
        </div>

        {res ? (
          <Resultado res={res} origin={origin} onNova={reset} />
        ) : (
          <>
            <label className="mb-1 block text-sm font-medium text-texto-suave">
              Categorias a contar
            </label>
            <div className="mb-4 max-h-56 space-y-1 overflow-y-auto rounded-cartao border border-borda p-3">
              {categorias.map((c) => (
                <label
                  key={c.id}
                  className="flex items-center gap-2 text-sm text-texto-suave"
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

            <label className="mb-1 block text-sm font-medium text-texto-suave">
              Colaborador
            </label>
            <select
              value={colab}
              onChange={(e) => setColab(e.target.value)}
              className="mb-4 w-full min-h-11 rounded-controle border border-borda-forte bg-transparent px-3 text-sm text-texto outline-none focus:border-primaria"
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
              className="w-full rounded-controle bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
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
      <div className="mb-3 rounded-cartao bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
        ✓ Contagem criada para <b>{res.nome}</b>. Envie o link:
      </div>
      <input
        readOnly
        value={link}
        onFocus={(e) => e.currentTarget.select()}
        className="mb-2 w-full rounded-controle border border-borda-forte bg-superficie-suave px-3 py-2 text-sm text-texto-suave dark:text-texto-fraco"
      />
      <div className="flex gap-2">
        <button
          onClick={() => {
            navigator.clipboard?.writeText(link);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 1500);
          }}
          className="flex-1 rounded-controle border border-borda-forte px-3 py-2 text-sm font-medium text-texto-suave hover:bg-superficie-suave dark:border-borda-forte"
        >
          {copiado ? "Copiado!" : "Copiar link"}
        </button>
        <a
          href={zapNum ? `https://web.whatsapp.com/send?phone=${zapNum}&text=${msg}` : `https://web.whatsapp.com/`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 rounded-controle bg-texto px-3 py-2 text-center text-sm font-medium text-fundo hover:opacity-90"
        >
          Enviar no WhatsApp
        </a>
      </div>
      <button
        onClick={onNova}
        className="mt-3 w-full rounded-controle px-3 py-2 text-sm text-texto-suave hover:bg-superficie-suave"
      >
        + Nova avulsa
      </button>
    </div>
  );
}
