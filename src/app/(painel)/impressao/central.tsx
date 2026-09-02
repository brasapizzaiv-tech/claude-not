"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  criarImpressora, criarImpressoraDetectada, renomearImpressora, definirImpressoraAtiva, definirImpressoraWindows, definirRecebeComandas, definirComandaProdutos, definirComandaConfig, definirEtiquetaConfig, imprimirTeste, imprimirTesteEtiqueta,
} from "./actions";

export type ComandaConfig = { largura: number; precos: boolean; garcom: boolean; hora: boolean; agrupar: boolean; qtdCat: boolean; destObs: boolean };
export type EtiquetaConfig = { largura: number; altura: number; margem: number; escala: number; qr: boolean; barraValidade?: boolean; categoria?: boolean; empresa?: string | null; deslocX?: number; deslocY?: number };
export type Impressora = { id: string; nome: string; ativo: boolean; impressora_windows: string | null; recebe_comandas: boolean; comanda_produtos: string[] | null; comanda_config: ComandaConfig | null; etiqueta_config: EtiquetaConfig | null };
export type Produto = { id: string; nome: string; categoria: string };

export function CentralImpressao({
  impressoras, produtos, token, hostname, printersPc, online, vistoEm,
}: {
  impressoras: Impressora[];
  produtos: Produto[];
  token: string;
  hostname: string | null;
  printersPc: string[];
  online: boolean;
  vistoEm: string | null;
}) {
  const router = useRouter();
  const [proc, start] = useTransition();
  const [novo, setNovo] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [verConfig, setVerConfig] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  function run(fn: () => Promise<unknown>) {
    start(async () => { await fn(); router.refresh(); });
  }

  const jaCadastradas = new Set(impressoras.map((i) => (i.impressora_windows || "").toLowerCase()));
  const detectadasNovas = printersPc.filter((p) => !jaCadastradas.has(p.toLowerCase()));
  const vistoTxt = vistoEm ? new Date(vistoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : null;

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mb-1 text-2xl font-bold text-zinc-900 dark:text-zinc-50">🖨️ Central de Impressões</h1>
      <p className="mb-5 text-sm text-zinc-500">
        Aqui ficam <b>todas as impressoras</b> (etiquetas hoje; comandas e cupons no futuro). As impressões saem por um
        <b> PC central</b> com o <b>Agente</b> instalado.
      </p>

      {/* Status do agente / PC responsável */}
      <div className={`mb-4 rounded-2xl border p-4 ${online ? "border-emerald-500/40 bg-emerald-500/5" : "border-amber-500/40 bg-amber-500/5"}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${online ? "bg-emerald-500" : "bg-amber-500"}`} />
            <span className="font-bold text-zinc-900 dark:text-zinc-50">
              {online ? "Agente conectado" : "Agente não conectado"}
            </span>
          </div>
          <span className="text-sm text-zinc-500">
            {hostname ? `PC: ${hostname}` : "Nenhum PC vinculado ainda"}
          </span>
        </div>
        <p className="mt-1 text-xs text-zinc-500">
          {online
            ? `Recebendo as impressões normalmente.${vistoTxt ? ` Último sinal: ${vistoTxt}.` : ""}`
            : "Instale o Agente no PC responsável (ou verifique se ele está aberto). Enquanto isso, nada será impresso."}
        </p>
        <button onClick={() => setVerConfig((v) => !v)} className="mt-2 text-xs text-blue-500 underline">
          {verConfig ? "esconder" : "ver"} dados do agente (endereço/token)
        </button>
        {verConfig && (
          <div className="mt-2 space-y-2 rounded-lg bg-zinc-100 p-3 text-sm dark:bg-zinc-800">
            <div className="flex flex-wrap items-center gap-2"><span className="w-20 shrink-0 text-zinc-400">Endereço:</span><code className="rounded bg-white px-2 py-0.5 dark:bg-zinc-900">{baseUrl}</code></div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-20 shrink-0 text-zinc-400">Token:</span>
              <code className="min-w-0 flex-1 truncate rounded bg-white px-2 py-0.5 dark:bg-zinc-900">{token}</code>
              <button onClick={() => { navigator.clipboard?.writeText(token); setCopiado(true); setTimeout(() => setCopiado(false), 1500); }} className="rounded border border-zinc-300 px-2 py-0.5 text-xs dark:border-zinc-700">{copiado ? "Copiado!" : "Copiar"}</button>
            </div>
          </div>
        )}
      </div>

      {/* Impressoras detectadas ainda não cadastradas */}
      {online && detectadasNovas.length > 0 && (
        <div className="mb-4 rounded-xl border border-blue-500/30 bg-blue-500/5 p-3">
          <p className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-200">Impressoras detectadas no PC (ainda não usadas):</p>
          <div className="flex flex-wrap gap-2">
            {detectadasNovas.map((p) => (
              <button key={p} disabled={proc} onClick={() => run(() => criarImpressoraDetectada(p))} className="rounded-lg border border-blue-400 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-500/10">
                + {p}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Impressoras cadastradas */}
      <h2 className="mb-2 font-bold text-zinc-900 dark:text-zinc-50">Impressoras</h2>
      <div className="space-y-2">
        {impressoras.length === 0 && <p className="text-sm text-zinc-500">Nenhuma impressora ainda. Adicione uma detectada acima, ou manualmente abaixo.</p>}
        {impressoras.map((im) => (
          <div key={im.id} className={`rounded-xl border p-3 dark:border-zinc-800 ${im.ativo ? "border-zinc-200" : "border-zinc-200 opacity-60"}`}>
            {editId === im.id ? (
              <div className="flex flex-wrap items-center gap-2">
                <input value={editNome} onChange={(e) => setEditNome(e.target.value)} className="flex-1 rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700" />
                <button disabled={proc} onClick={() => { run(() => renomearImpressora(im.id, editNome)); setEditId(null); }} className="rounded-lg bg-orange-500 px-3 py-2 text-sm font-medium text-white">Salvar</button>
                <button onClick={() => setEditId(null)} className="rounded-lg px-3 py-2 text-sm text-zinc-500">Cancelar</button>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold text-zinc-900 dark:text-zinc-100">🖨️ {im.nome}{im.ativo ? "" : " (inativa)"}</div>
                  <div className="flex items-center gap-2">
                    <button
                      disabled={proc}
                      onClick={() => { run(() => imprimirTeste(im.id)); setMsg(`Teste enviado para "${im.nome}". Deve sair na impressora.`); setTimeout(() => setMsg(null), 4000); }}
                      className="rounded-lg border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      🖨️ testar
                    </button>
                    <button onClick={() => { setEditId(im.id); setEditNome(im.nome); }} className="text-sm text-orange-600 hover:underline">renomear</button>
                    <button onClick={() => run(() => definirImpressoraAtiva(im.id, !im.ativo))} className="text-sm text-zinc-400 hover:text-zinc-600">{im.ativo ? "desativar" : "reativar"}</button>
                  </div>
                </div>
                <WinField im={im} printersPc={printersPc} proc={proc} run={run} />
                <label className="mt-2 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
                  <input type="checkbox" checked={im.recebe_comandas} disabled={proc} onChange={(e) => run(() => definirRecebeComandas(im.id, e.target.checked))} />
                  🍳 Recebe comandas (cozinha/bar)
                </label>
                {im.recebe_comandas && <ViaProdutos im={im} produtos={produtos} proc={proc} run={run} />}
                {im.recebe_comandas && <ViaFormato im={im} proc={proc} run={run} />}
                <EtiquetaFormato im={im} proc={proc} run={run} />
              </>
            )}
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-zinc-300 p-3 dark:border-zinc-700">
        <input value={novo} onChange={(e) => setNovo(e.target.value)} placeholder="Nome da nova impressora (ex.: Cozinha, Bar)" className="flex-1 rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700" />
        <button disabled={proc || !novo.trim()} onClick={() => { run(() => criarImpressora(novo)); setNovo(""); }} className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          + Adicionar impressora
        </button>
      </div>

      {msg && (
        <div className="fixed inset-x-4 bottom-6 z-50 mx-auto max-w-md rounded-xl bg-zinc-900 px-4 py-3 text-center text-sm font-medium text-white shadow-lg">
          {msg}
        </div>
      )}
    </div>
  );
}

// Formato da ETIQUETA desta impressora (aparece pra qualquer impressora — só
// importa pra quem imprime etiquetas, ex.: a Elgin).
function EtiquetaFormato({ im, proc, run }: {
  im: Impressora; proc: boolean; run: (fn: () => Promise<unknown>) => void;
}) {
  const def: EtiquetaConfig = { largura: 55, altura: 55, margem: 3, escala: 100, qr: true };
  const [aberto, setAberto] = useState(!!im.etiqueta_config);
  const [c, setC] = useState<EtiquetaConfig>({ ...def, ...(im.etiqueta_config ?? {}) });
  const [salvo, setSalvo] = useState(false);

  const num = (v: string, min: number, max: number, fb: number) => {
    const n = Number(String(v).replace(",", "."));
    return Number.isFinite(n) && n > 0 ? Math.min(Math.max(n, min), max) : fb;
  };
  function salvar(novo: EtiquetaConfig) {
    setC(novo);
    run(async () => { await definirEtiquetaConfig(im.id, novo); setSalvo(true); setTimeout(() => setSalvo(false), 2000); });
  }
  const campo = "w-16 rounded-lg border border-zinc-300 bg-transparent px-2 py-1 text-sm dark:border-zinc-700";

  if (!aberto) {
    return (
      <button onClick={() => setAberto(true)} className="mt-2 text-xs font-medium text-zinc-500 hover:text-orange-600">
        🏷️ Formato da etiqueta {im.etiqueta_config ? `(${c.largura}×${c.altura}mm)` : "(padrão 55×55mm)"} ▸
      </button>
    );
  }
  return (
    <div className="mt-2 rounded-lg bg-zinc-50 p-2 dark:bg-zinc-800/40">
      <button onClick={() => setAberto(false)} className="mb-1.5 text-xs text-zinc-500">🏷️ Formato da etiqueta ▾</button>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-zinc-600 dark:text-zinc-300">
        <label className="flex items-center gap-1.5">Largura
          <input defaultValue={c.largura} inputMode="decimal" disabled={proc} onBlur={(e) => salvar({ ...c, largura: num(e.target.value, 25, 120, 55) })} className={campo} /> mm
        </label>
        <label className="flex items-center gap-1.5">Altura
          <input defaultValue={c.altura} inputMode="decimal" disabled={proc} onBlur={(e) => salvar({ ...c, altura: num(e.target.value, 25, 120, 55) })} className={campo} /> mm
        </label>
        <label className="flex items-center gap-1.5">Margem
          <input defaultValue={c.margem} inputMode="decimal" disabled={proc} onBlur={(e) => salvar({ ...c, margem: num(e.target.value, 0, 10, 3) })} className={campo} /> mm
        </label>
        <label className="flex items-center gap-1.5">Letra:
          {[["Pequena", 85], ["Normal", 100], ["Grande", 115]].map(([lbl, v]) => (
            <button key={v} disabled={proc} onClick={() => salvar({ ...c, escala: v as number })} className={`rounded-lg px-2.5 py-1 text-xs font-medium ${c.escala === v ? "bg-orange-500 text-white" : "border border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"}`}>{lbl}</button>
          ))}
        </label>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={c.qr} disabled={proc} onChange={(e) => salvar({ ...c, qr: e.target.checked })} /> QR code</label>
        {salvo && <span className="text-xs font-semibold text-emerald-600">✓ salvo</span>}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-zinc-600 dark:text-zinc-300">
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={!!c.barraValidade} disabled={proc} onChange={(e) => salvar({ ...c, barraValidade: e.target.checked })} /> VALIDADE em barra preta</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={!!c.categoria} disabled={proc} onChange={(e) => salvar({ ...c, categoria: e.target.checked })} /> Mostrar categoria</label>
        <label className="flex items-center gap-1.5">Rodapé (empresa/CNPJ):
          <input defaultValue={c.empresa ?? ""} placeholder="Brasa Pizzaria · 47.261.660/0001-90" disabled={proc} onBlur={(e) => salvar({ ...c, empresa: e.target.value.trim() || null })} className="w-72 rounded-lg border border-zinc-300 bg-transparent px-2 py-1 text-sm dark:border-zinc-700" />
        </label>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-zinc-600 dark:text-zinc-300">
        <span className="font-medium">Calibração:</span>
        <label className="flex items-center gap-1.5">↕ vertical
          <input defaultValue={c.deslocY ?? 0} inputMode="decimal" disabled={proc} onBlur={(e) => salvar({ ...c, deslocY: Math.max(-15, Math.min(15, Number(String(e.target.value).replace(",", ".")) || 0)) })} className={campo} /> mm
        </label>
        <label className="flex items-center gap-1.5">↔ horizontal
          <input defaultValue={c.deslocX ?? 0} inputMode="decimal" disabled={proc} onBlur={(e) => salvar({ ...c, deslocX: Math.max(-15, Math.min(15, Number(String(e.target.value).replace(",", ".")) || 0)) })} className={campo} /> mm
        </label>
        <button
          disabled={proc}
          onClick={() => { setSalvo(false); run(async () => { await imprimirTesteEtiqueta(im.id); setSalvo(true); setTimeout(() => setSalvo(false), 2500); }); }}
          className="rounded-lg border border-orange-400 px-2.5 py-1 text-xs font-semibold text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950/30"
        >
          🏷️ Imprimir etiqueta de teste
        </button>
      </div>
      <p className="mt-1 text-[11px] text-zinc-400">
        Vale pras etiquetas impressas nesta impressora (todos os tipos). A Elgin L42 usa 55×55mm. A pré-visualização nos formulários já segue essas opções.
        <b> Calibração:</b> a etiqueta de teste sai com uma moldura na borda — se a moldura sair pra baixo, use vertical <b>negativo</b> (ex.: −5 sobe 5 mm); pra direita, horizontal negativo.
      </p>
    </div>
  );
}

function ViaFormato({ im, proc, run }: {
  im: Impressora; proc: boolean; run: (fn: () => Promise<unknown>) => void;
}) {
  const def: ComandaConfig = { largura: 80, precos: false, garcom: true, hora: true, agrupar: false, qtdCat: false, destObs: false };
  const [c, setC] = useState<ComandaConfig>({ ...def, ...(im.comanda_config ?? {}) });
  function salvar(novo: ComandaConfig) { setC(novo); run(() => definirComandaConfig(im.id, novo)); }
  const wbtn = (mm: number) => `rounded-lg px-3 py-1 text-sm font-medium ${c.largura === mm ? "bg-orange-500 text-white" : "border border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"}`;
  return (
    <div className="mt-2 rounded-lg bg-zinc-50 p-2 dark:bg-zinc-800/40">
      <div className="mb-1.5 text-xs text-zinc-500">Formato da impressão:</div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-500">Largura:</span>
        <button disabled={proc} onClick={() => salvar({ ...c, largura: 58 })} className={wbtn(58)}>58mm</button>
        <button disabled={proc} onClick={() => salvar({ ...c, largura: 80 })} className={wbtn(80)}>80mm</button>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-600 dark:text-zinc-300">
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={c.precos} disabled={proc} onChange={(e) => salvar({ ...c, precos: e.target.checked })} /> Mostrar preços</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={c.garcom} disabled={proc} onChange={(e) => salvar({ ...c, garcom: e.target.checked })} /> Mostrar garçom</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={c.hora} disabled={proc} onChange={(e) => salvar({ ...c, hora: e.target.checked })} /> Mostrar hora</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={c.agrupar} disabled={proc} onChange={(e) => salvar({ ...c, agrupar: e.target.checked })} /> Agrupar por categoria</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={c.qtdCat} disabled={proc} onChange={(e) => salvar({ ...c, qtdCat: e.target.checked })} /> Qtd por categoria</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={c.destObs} disabled={proc} onChange={(e) => salvar({ ...c, destObs: e.target.checked })} /> Destacar observações</label>
      </div>
    </div>
  );
}

function ViaProdutos({ im, produtos, proc, run }: {
  im: Impressora; produtos: Produto[]; proc: boolean; run: (fn: () => Promise<unknown>) => void;
}) {
  const allIds = useMemo(() => produtos.map((p) => p.id), [produtos]);
  const grupos = useMemo(() => {
    const m = new Map<string, Produto[]>();
    for (const p of produtos) { const l = m.get(p.categoria) ?? []; l.push(p); m.set(p.categoria, l); }
    return [...m.entries()];
  }, [produtos]);

  // null = todos → começa com tudo marcado
  const [sel, setSel] = useState<Set<string>>(new Set(im.comanda_produtos ?? allIds));
  const [abertas, setAbertas] = useState<Set<string>>(new Set());

  function salvar(novo: Set<string>) {
    setSel(novo);
    const valor = novo.size === allIds.length ? null : [...novo]; // tudo = todos (null)
    run(() => definirComandaProdutos(im.id, valor));
  }
  function toggleProd(id: string) { const n = new Set(sel); if (n.has(id)) n.delete(id); else n.add(id); salvar(n); }
  function toggleCat(prods: Produto[], marcar: boolean) {
    const n = new Set(sel);
    for (const p of prods) { if (marcar) n.add(p.id); else n.delete(p.id); }
    salvar(n);
  }
  const toggleAberta = (cat: string) => setAbertas((a) => { const n = new Set(a); if (n.has(cat)) n.delete(cat); else n.add(cat); return n; });

  return (
    <div className="mt-2 rounded-lg bg-zinc-50 p-2 dark:bg-zinc-800/40">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs text-zinc-500">Imprime {sel.size === allIds.length ? "todos os produtos" : `${sel.size} de ${allIds.length} produtos`}:</span>
        <span className="flex gap-2 text-xs">
          <button disabled={proc} onClick={() => salvar(new Set(allIds))} className="text-blue-500 hover:underline">todos</button>
          <button disabled={proc} onClick={() => salvar(new Set())} className="text-zinc-400 hover:underline">nenhum</button>
        </span>
      </div>
      <div className="space-y-1">
        {grupos.map(([cat, prods]) => {
          const marcados = prods.filter((p) => sel.has(p.id)).length;
          const todos = marcados === prods.length;
          const alguns = marcados > 0 && !todos;
          const aberta = abertas.has(cat);
          return (
            <div key={cat} className="rounded-md border border-zinc-200 dark:border-zinc-700">
              <div className="flex items-center gap-2 px-2 py-1.5">
                <button onClick={() => toggleAberta(cat)} className="text-zinc-400">{aberta ? "▾" : "▸"}</button>
                <input
                  type="checkbox"
                  ref={(el) => { if (el) el.indeterminate = alguns; }}
                  checked={todos}
                  disabled={proc}
                  onChange={() => toggleCat(prods, !todos)}
                />
                <span className="flex-1 text-sm font-medium">{cat}</span>
                <span className="text-xs text-zinc-400">{marcados}/{prods.length}</span>
              </div>
              {aberta && (
                <div className="space-y-0.5 border-t border-zinc-200 px-3 py-1.5 dark:border-zinc-700">
                  {prods.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
                      <input type="checkbox" checked={sel.has(p.id)} disabled={proc} onChange={() => toggleProd(p.id)} />
                      {p.nome}
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WinField({ im, printersPc, proc, run }: {
  im: Impressora; printersPc: string[]; proc: boolean; run: (fn: () => Promise<unknown>) => void;
}) {
  const [val, setVal] = useState(im.impressora_windows ?? "");
  const mudou = val.trim() !== (im.impressora_windows ?? "");
  const temLista = printersPc.length > 0;
  // se o valor atual não está na lista detectada, oferece opção "outro"
  const naLista = printersPc.some((p) => p === val);

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <span className="text-xs text-zinc-400">Impressora no PC:</span>
      {temLista ? (
        <select
          value={naLista || val === "" ? val : "__outro__"}
          onChange={(e) => setVal(e.target.value === "__outro__" ? " " : e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-transparent px-2 py-1 text-sm dark:border-zinc-700"
        >
          <option value="">(escolher)</option>
          {printersPc.map((p) => <option key={p} value={p}>{p}</option>)}
          <option value="__outro__">Outro (digitar)…</option>
        </select>
      ) : null}
      {(!temLista || !naLista) && (
        <input
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="ex.: ELGIN L42PRO FULL"
          className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-transparent px-2 py-1 text-sm dark:border-zinc-700"
        />
      )}
      {mudou && (
        <button disabled={proc} onClick={() => run(() => definirImpressoraWindows(im.id, val))} className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-medium text-white">Salvar</button>
      )}
    </div>
  );
}
