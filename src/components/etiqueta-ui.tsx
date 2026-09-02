"use client";

import Link from "next/link";
import { useState } from "react";
import { FAIXAS, type Contagem, type Faixa } from "@/lib/etiqueta-vencimentos";
import { CONS_LABEL, TIPOS, dataBRcurta, linhasExtras, tipoInfo, type EtiquetaConfig, type EtiquetaDados, type TipoEtiqueta } from "@/lib/etiqueta-tipos";

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
  unidade?: string | null;
};
// Conservação sugerida pelo cadastro do item (a que tem validade; resfriado ganha).
export function conservacaoPadrao(p: ItemEtq | undefined, atual: string) {
  if (!p) return atual;
  if (p.validade_resfriado) return "resfriado";
  if (p.validade_congelado) return "congelado";
  if (p.validade_ambiente) return "ambiente";
  return atual;
}
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

// ---------- Tipo da etiqueta ----------
export function TipoSelector({ value, onChange }: { value: TipoEtiqueta; onChange: (t: TipoEtiqueta) => void }) {
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {TIPOS.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          title={t.dica}
          className={`rounded-xl border px-1 py-2 text-center text-[11px] font-semibold leading-tight ${
            value === t.key ? "border-orange-500 bg-orange-500 text-white" : "border-zinc-300 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          }`}
        >
          <div className="text-base">{t.icone}</div>
          {t.titulo}
        </button>
      ))}
    </div>
  );
}

// ---------- Campos opcionais (marca, lote, validade original, SIF) ----------
export type Extras = { marca: string; lote: string; validadeOriginal: string; sif: string };
export const EXTRAS_VAZIO: Extras = { marca: "", lote: "", validadeOriginal: "", sif: "" };

export function CamposExtras({ value, onChange }: { value: Extras; onChange: (v: Extras) => void }) {
  const [aberto, setAberto] = useState(false);
  const preenchidos = Object.values(value).filter(Boolean).length;
  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)} className="text-xs font-medium text-zinc-500 hover:text-orange-600">
        ＋ Mais campos (marca, lote, validade original, SIF){preenchidos ? ` · ${preenchidos} preenchido(s)` : ""} ▸
      </button>
    );
  }
  const set = (p: Partial<Extras>) => onChange({ ...value, ...p });
  return (
    <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
      <button type="button" onClick={() => setAberto(false)} className="mb-2 text-xs font-medium text-zinc-500">Mais campos ▾</button>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[11px] text-zinc-500">Marca / fornecedor
          <input value={value.marca} onChange={(e) => set({ marca: e.target.value })} className={`${inputCls} mt-0.5 py-2`} />
        </label>
        <label className="text-[11px] text-zinc-500">Lote
          <input value={value.lote} onChange={(e) => set({ lote: e.target.value })} className={`${inputCls} mt-0.5 py-2`} />
        </label>
        <label className="text-[11px] text-zinc-500">Validade original (fabricante)
          <input type="date" value={value.validadeOriginal} onChange={(e) => set({ validadeOriginal: e.target.value })} className={`${inputCls} mt-0.5 py-2`} />
        </label>
        <label className="text-[11px] text-zinc-500">SIF / registro
          <input value={value.sif} onChange={(e) => set({ sif: e.target.value })} className={`${inputCls} mt-0.5 py-2`} />
        </label>
      </div>
    </div>
  );
}

// ---------- Desenho da etiqueta (mesmo layout do PDF em src/lib/etiqueta-pdf.ts) ----------
// `qr` = data URL do QR real; sem ele desenha um quadrado (pré-visualização).
export function EtiquetaVisual({ d, config, qr, className }: { d: EtiquetaDados; config?: EtiquetaConfig | null; qr?: string | null; className?: string }) {
  const c = { largura: 55, altura: 55, margem: 3, escala: 100, qr: true, barraValidade: false, categoria: false, empresa: null as string | null, ...(config ?? {}) };
  // Quanto mais coisa na etiqueta, menor a letra (o PDF mede de verdade; aqui é
  // uma aproximação pra pré-visualização não estourar).
  const cheio =
    (c.categoria && d.categoria ? 1 : 0) + (linhasExtras(d).length ? 1 : 0) + (c.barraValidade ? 1 : 0) + (c.empresa ? 1 : 0) + (d.quantidade != null ? 0.5 : 0);
  const fe = Math.min(Math.max((c.escala || 100) / 100, 0.6), 1.6) * Math.max(0.74, 1 - 0.07 * cheio);
  const px = (n: number) => `${(n * fe).toFixed(1)}px`;
  const t = tipoInfo(d.tipo);
  const livre = t.key === "livre";
  const manip = new Date(d.manipuladoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
  const extras = linhasExtras(d);
  const linhas = [`${t.dataLabel}: ${manip}`, `Resp.: ${d.colaborador ?? "—"}`, `Nº ${d.numero || "—"}`, ...(c.empresa ? [c.empresa] : [])];
  const qrMm = (16 * Math.min(c.largura, c.altura)) / 55;
  const rotulo = livre ? "VÁLIDO ATÉ" : "VALIDADE";
  const data = d.validade ? dataBRcurta(d.validade) : "—";

  return (
    <div
      className={`etiqueta-print bg-white text-black ${className ?? ""}`}
      style={{ width: `${c.largura}mm`, height: `${c.altura}mm`, padding: `${c.margem}mm`, boxSizing: "border-box", overflow: "hidden", display: "flex", flexDirection: "column", fontFamily: "Arial, Helvetica, sans-serif" }}
    >
      <div style={{ textAlign: "center", fontSize: px(9), fontWeight: 700, letterSpacing: 1 }}>{livre ? "BRASA" : `BRASA · ${t.cabecalho}`}</div>
      <div style={{ textAlign: "center", fontSize: px(15), fontWeight: 800, lineHeight: 1.1, margin: "2px 0", color: d.produto ? "#000" : "#bbb" }}>{d.produto || "Escolha o item"}</div>
      {c.categoria && d.categoria && <div style={{ textAlign: "center", fontSize: px(8) }}>{">> " + d.categoria.toUpperCase()}</div>}
      {livre ? (
        d.texto && <div style={{ textAlign: "center", fontSize: px(10.5), whiteSpace: "pre-wrap", marginTop: 3, lineHeight: 1.25 }}>{d.texto}</div>
      ) : (
        <>
          {d.conservacao && (
            <div style={{ textAlign: "center", fontSize: px(11), fontWeight: 700, border: "1px solid #000", borderRadius: 4, padding: "1px 0", margin: "1px 6mm" }}>
              {CONS_LABEL[d.conservacao] ?? d.conservacao}
            </div>
          )}
          {d.quantidade != null && (
            <div style={{ textAlign: "center", fontSize: px(11) }}>
              Qtd: <b>{d.quantidade} {d.unidade ?? ""}</b>
            </div>
          )}
          {extras.length > 0 && <div style={{ textAlign: "center", fontSize: px(8) }}>{extras.join("  ·  ")}</div>}
        </>
      )}
      {(!livre || d.validade) &&
        (c.barraValidade ? (
          <div style={{ background: "#000", color: "#fff", textAlign: "center", marginTop: 4, padding: "2px 0" }}>
            <div style={{ fontSize: px(8) }}>{rotulo}</div>
            <div style={{ fontSize: px(19), fontWeight: 800, lineHeight: 1 }}>{data}</div>
          </div>
        ) : (
          <>
            <div style={{ textAlign: "center", fontSize: px(9), marginTop: "2mm" }}>{rotulo}</div>
            <div style={{ textAlign: "center", fontSize: px(22), fontWeight: 800, lineHeight: 1 }}>{data}</div>
          </>
        ))}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: "auto", gap: 4 }}>
        <div style={{ fontSize: px(linhas.length > 3 ? 8 : 9), lineHeight: 1.3, minWidth: 0 }}>
          {linhas.map((l, i) => <div key={i}>{l}</div>)}
        </div>
        {c.qr &&
          (qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="QR" style={{ width: `${qrMm}mm`, height: `${qrMm}mm`, flexShrink: 0 }} />
          ) : (
            <div style={{ width: `${qrMm}mm`, height: `${qrMm}mm`, flexShrink: 0, background: "repeating-linear-gradient(45deg,#000 0 2px,#fff 2px 5px)", opacity: 0.35 }} />
          ))}
      </div>
    </div>
  );
}

// Pré-visualização enquanto preenche o formulário.
export function PreviewEtiqueta({ d, config }: { d: EtiquetaDados; config?: EtiquetaConfig | null }) {
  return <EtiquetaVisual d={d} config={config} className="mx-auto shadow-md ring-1 ring-zinc-300" />;
}

// ---------- Validade padrão ----------
export function emDias(dias: number) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}
export function diasDoItem(p: ItemEtq | undefined, cons: string) {
  if (!p) return null;
  return cons === "congelado" ? p.validade_congelado : cons === "ambiente" ? p.validade_ambiente : p.validade_resfriado;
}
// Amostra: 72 h. Descongelamento: prazo resfriado do item (ou 3 dias). Demais: validade do item na conservação.
export function diasPadrao(p: ItemEtq | undefined, cons: string, tipo: TipoEtiqueta): number | null {
  if (tipo === "amostra") return 3;
  if (tipo === "descongelamento") return p?.validade_resfriado ?? 3;
  return diasDoItem(p, cons);
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
