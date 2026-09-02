"use client";

import Link from "next/link";
import { useState } from "react";
import { FAIXAS, type Contagem, type Faixa } from "@/lib/etiqueta-vencimentos";
import { dataBR } from "@/lib/format";

// ---------- Painel de vencimentos (4 cartões) ----------
export function PainelVencimentos({ contagem, base, ativo }: { contagem: Contagem; base: string; ativo?: Faixa | null }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {FAIXAS.map((f) => {
        const sel = ativo === f.key;
        return (
          <Link
            key={f.key}
            href={sel ? base : `${base}?f=${f.key}`}
            className={`rounded-2xl p-3 text-white shadow-sm transition ${f.cor} ${sel ? "ring-4 ring-zinc-900/30 dark:ring-white/50" : "hover:opacity-90"}`}
          >
            <div className="text-3xl font-black leading-none">{contagem[f.key]}</div>
            <div className="mt-1 text-sm font-semibold">{f.titulo}</div>
            {f.key === "hoje" && contagem.vencidas > 0 && (
              <div className="text-[11px] opacity-90">{contagem.vencidas} já vencida(s)</div>
            )}
          </Link>
        );
      })}
    </div>
  );
}

// ---------- Seletor de item (busca + recentes + categorias em botões) ----------
export type ItemEtq = {
  id: string;
  nome: string;
  categoria_id: string | null;
  validade_congelado: number | null;
  validade_resfriado: number | null;
  validade_ambiente: number | null;
};
export type CatEtq = { id: string; nome: string };
export type NovoItemDados = {
  nome: string;
  categoria_id: string | null;
  validade_congelado: number | null;
  validade_resfriado: number | null;
  validade_ambiente: number | null;
};

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const inputCls =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";
const itemBtn =
  "rounded-xl border border-zinc-300 bg-white px-3 py-3 text-left text-sm font-semibold text-zinc-800 hover:border-orange-500 hover:bg-orange-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-orange-950/30";

export function SeletorItem({
  itens,
  categorias,
  recentes,
  value,
  onChange,
  onNovo,
}: {
  itens: ItemEtq[];
  categorias: CatEtq[];
  recentes: string[];
  value: string;
  onChange: (id: string) => void;
  // Cadastro rápido "＋" direto da tela (devolve o item criado).
  onNovo?: (d: NovoItemDados) => Promise<ItemEtq | null>;
}) {
  const [busca, setBusca] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);
  const [nNome, setNNome] = useState("");
  const [nResf, setNResf] = useState("");
  const [nCong, setNCong] = useState("");
  const [nAmb, setNAmb] = useState("");
  const [salvando, setSalvando] = useState(false);

  const sel = itens.find((i) => i.id === value);
  if (sel) {
    return (
      <div className="flex items-center justify-between rounded-xl border-2 border-orange-500 bg-orange-50 px-3 py-2.5 dark:bg-orange-950/30">
        <div className="min-w-0">
          <div className="truncate font-bold text-zinc-900 dark:text-zinc-50">{sel.nome}</div>
          <div className="text-xs text-zinc-500">{categorias.find((c) => c.id === sel.categoria_id)?.nome ?? "Sem categoria"}</div>
        </div>
        <button type="button" onClick={() => { onChange(""); setBusca(""); }} className="shrink-0 text-sm font-medium text-orange-600">
          trocar
        </button>
      </div>
    );
  }

  const q = norm(busca.trim());
  const filtrados = q ? itens.filter((i) => norm(i.nome).includes(q)).slice(0, 30) : [];
  const recs = recentes.map((id) => itens.find((i) => i.id === id)).filter((i): i is ItemEtq => !!i).slice(0, 8);
  const daCat = cat ? itens.filter((i) => i.categoria_id === cat) : [];
  const catNome = categorias.find((c) => c.id === cat)?.nome ?? "";

  async function salvarNovo() {
    if (!onNovo || !nNome.trim()) return;
    setSalvando(true);
    const n = (s: string) => (s.trim() ? Number(s) || null : null);
    const item = await onNovo({ nome: nNome.trim(), categoria_id: cat, validade_resfriado: n(nResf), validade_congelado: n(nCong), validade_ambiente: n(nAmb) });
    setSalvando(false);
    if (item) { setNovo(false); setNNome(""); setNResf(""); setNCong(""); setNAmb(""); onChange(item.id); }
  }

  return (
    <div className="space-y-2">
      <input
        value={busca}
        onChange={(e) => { setBusca(e.target.value); setCat(null); }}
        placeholder="🔍 Buscar item..."
        className={inputCls}
        autoComplete="off"
      />

      {q ? (
        filtrados.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 p-3 text-center text-sm text-zinc-400 dark:border-zinc-700">
            Nada encontrado.{onNovo ? " Escolha uma categoria abaixo e use ＋ pra cadastrar." : ""}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {filtrados.map((i) => (
              <button key={i.id} type="button" onClick={() => onChange(i.id)} className={itemBtn}>{i.nome}</button>
            ))}
          </div>
        )
      ) : cat ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => { setCat(null); setNovo(false); }} className="text-sm text-zinc-500">← Categorias</button>
            <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">{catNome}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {daCat.map((i) => (
              <button key={i.id} type="button" onClick={() => onChange(i.id)} className={itemBtn}>{i.nome}</button>
            ))}
            {onNovo && !novo && (
              <button type="button" onClick={() => setNovo(true)} className="rounded-xl border-2 border-dashed border-orange-400 px-3 py-3 text-sm font-semibold text-orange-600">
                ＋ Novo item
              </button>
            )}
          </div>
          {daCat.length === 0 && !novo && <p className="text-center text-xs text-zinc-400">Nenhum item nesta categoria ainda.</p>}
          {novo && (
            <div className="space-y-2 rounded-xl border border-orange-300 bg-orange-50/50 p-3 dark:border-orange-800 dark:bg-orange-950/20">
              <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">Novo item em {catNome}</p>
              <input value={nNome} onChange={(e) => setNNome(e.target.value)} placeholder="Nome (ex.: Base Feijão)" className={inputCls} autoFocus />
              <div className="grid grid-cols-3 gap-2">
                {[["Resfriado", nResf, setNResf], ["Congelado", nCong, setNCong], ["Ambiente", nAmb, setNAmb]].map(([lab, v, set]) => (
                  <label key={lab as string} className="text-[11px] text-zinc-500">
                    {lab as string} (dias)
                    <input inputMode="numeric" value={v as string} onChange={(e) => (set as (s: string) => void)(e.target.value)} placeholder="—" className={`${inputCls} mt-0.5 px-2 py-2 text-center`} />
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={salvarNovo} disabled={salvando || !nNome.trim()} className="flex-1 rounded-lg bg-orange-500 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  {salvando ? "Salvando..." : "Salvar e usar"}
                </button>
                <button type="button" onClick={() => setNovo(false)} className="rounded-lg border border-zinc-300 px-3 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">Cancelar</button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {recs.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Recentes</p>
              <div className="flex flex-wrap gap-1.5">
                {recs.map((i) => (
                  <button key={i.id} type="button" onClick={() => onChange(i.id)} className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:border-orange-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
                    {i.nome}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Categorias</p>
            <div className="grid grid-cols-3 gap-2">
              {categorias.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCat(c.id)}
                  className="min-h-16 rounded-xl bg-[#C78340] px-2 py-2 text-center text-xs font-semibold leading-tight text-white hover:brightness-110"
                >
                  {c.nome}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Pré-visualização da etiqueta (mesmo desenho do PDF 55×55) ----------
const CONS: Record<string, string> = { congelado: "CONGELADO", resfriado: "RESFRIADO", ambiente: "AMBIENTE" };

export function PreviewEtiqueta({
  produto,
  conservacao,
  quantidade,
  unidade,
  validade,
  colaborador,
}: {
  produto: string;
  conservacao: string;
  quantidade: string;
  unidade: string;
  validade: string;
  colaborador: string;
}) {
  const agora = new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
  const qtd = quantidade.trim();
  return (
    <div
      className="mx-auto bg-white text-black shadow-md ring-1 ring-zinc-300"
      style={{ width: "55mm", height: "55mm", padding: "3mm", boxSizing: "border-box", overflow: "hidden", display: "flex", flexDirection: "column", fontFamily: "Arial, sans-serif" }}
    >
      <div style={{ textAlign: "center", fontSize: "9px", fontWeight: 700, letterSpacing: 1 }}>BRASA · MANIPULAÇÃO</div>
      <div style={{ textAlign: "center", fontSize: "15px", fontWeight: 800, lineHeight: 1.1, margin: "2px 0", color: produto ? "#000" : "#bbb" }}>
        {produto || "Escolha o item"}
      </div>
      {CONS[conservacao] && (
        <div style={{ textAlign: "center", fontSize: "11px", fontWeight: 700, border: "1px solid #000", borderRadius: 4, padding: "1px 0", margin: "1px 6mm" }}>
          {CONS[conservacao]}
        </div>
      )}
      {qtd && (
        <div style={{ textAlign: "center", fontSize: "11px" }}>
          Qtd: <b>{qtd} {unidade}</b>
        </div>
      )}
      <div style={{ textAlign: "center", fontSize: "9px", marginTop: "2mm" }}>VALIDADE</div>
      <div style={{ textAlign: "center", fontSize: "22px", fontWeight: 800, lineHeight: 1 }}>{validade ? dataBR(validade) : "—"}</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: "auto" }}>
        <div style={{ fontSize: "9px", lineHeight: 1.35 }}>
          <div>Manip.: {agora}</div>
          <div>Por: {colaborador || "—"}</div>
          <div>Nº —</div>
        </div>
        <div style={{ width: "16mm", height: "16mm", background: "repeating-linear-gradient(45deg,#000 0 2px,#fff 2px 5px)", opacity: 0.35 }} />
      </div>
    </div>
  );
}

// ---------- Contador de cópias ----------
export function Copias({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const b = "h-10 w-10 rounded-lg border border-zinc-300 text-lg font-bold text-zinc-700 dark:border-zinc-700 dark:text-zinc-200";
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => onChange(Math.max(1, value - 1))} className={b}>−</button>
      <span className="w-8 text-center text-lg font-bold text-zinc-900 dark:text-zinc-50">{value}</span>
      <button type="button" onClick={() => onChange(Math.min(10, value + 1))} className={b}>+</button>
      <span className="text-xs text-zinc-500">cópia(s)</span>
    </div>
  );
}
