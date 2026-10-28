"use client";


// Peças de montagem de pedido compartilhadas entre o painel do delivery
// (/delivery/novo) e o app público do cliente (/pedir): modal de pizza
// (tamanho, meio a meio, borda) e modal de complementos/combos.
import { useMemo, useState } from "react";
import type { LinhaPedido } from "@/lib/delivery-core";
import { nomesDosSabores } from "@/lib/pizza-sabores";
import { Icone } from "@/components/icone";
import { precoComEtapas, problemaDasEscolhas } from "@/lib/combo-preco";

// combo (migration 0263): item com etapas; a_partir = menor preço possível (o card mostra "a partir de").
export type Item = { id: string; nome: string; categoria: string; preco: number; preco_antigo?: number | null; foto_url?: string | null; descricao?: string | null; combo?: boolean; a_partir?: number | null };
export type Tam = { id: string; nome: string; max_sabores: number; fatias?: number | null };
export type Sabor = { id: string; nome: string; foto_url?: string | null; descricao?: string | null; novo?: boolean };
export type Borda = { id: string; nome: string };
export type Grupo = { id: string; item_id: string; nome: string; min: number; max: number; permite_repetir: boolean; media?: boolean };
export type Opcao = { id: string; grupo_id: string; nome: string; preco: number };
export type PizzaData = {
  tamanhos: Tam[]; sabores: Sabor[];
  saborPrecos: { sabor_id: string; tamanho_id: string; preco: number }[];
  bordas: Borda[]; bordaPrecos: { borda_id: string; tamanho_id: string; preco: number }[];
};
/** porKg: item vendido por kg (migration 0259) — qtd é o peso. */
export type CartLine = { uid: string; descricao: string; preco: number; qtd: number; payload: LinhaPedido; porKg?: boolean };

export const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

let seq = 0;
export const novoUid = () => `l${++seq}`;

// Montar pizza EM ETAPAS (modelo do app do Suitable, pedido do Rafael em
// 17/10/2026): Tamanho → Bordas → Sabores → Observações → Confirmar. Uma coisa
// por tela, com o total sempre no rodapé e Voltar/Próximo. Os sabores têm − e +
// (o mesmo sabor pode repetir: 2/3 de um e 1/3 de outro) e uma lupa pra achar
// pelo começo do nome. Vale pro garçom, pro novo pedido do delivery e pro app
// do cliente (/pedir).
type Etapa = "tamanho" | "bordas" | "sabores" | "obs";
const ROTULO_ETAPA: Record<Etapa, string> = { tamanho: "Tamanho", bordas: "Bordas", sabores: "Sabores", obs: "Observações" };
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function PizzaModal({ pizza, onClose, onAdd, tamanhoInicial, saborInicial, comObs }: {
  pizza: PizzaData;
  onClose: () => void;
  onAdd: (l: CartLine) => void;
  tamanhoInicial?: string;
  /** Abre já com um sabor marcado (vitrine "Novidades" do app do cliente). */
  saborInicial?: string;
  comObs?: boolean;
}) {
  const [tamId, setTamId] = useState(tamanhoInicial ?? "");
  const [sabIds, setSabIds] = useState<string[]>(saborInicial ? [saborInicial] : []);
  const [bordaId, setBordaId] = useState<string>("");
  const [obs, setObs] = useState("");
  const [busca, setBusca] = useState("");
  const [buscaOn, setBuscaOn] = useState(false);
  const tam = pizza.tamanhos.find((t) => t.id === tamId);
  const max = tam?.max_sabores ?? 1;

  const precoSabor = (sid: string) => pizza.saborPrecos.find((p) => p.sabor_id === sid && p.tamanho_id === tamId)?.preco ?? 0;
  const precoBorda = (bid: string) => pizza.bordaPrecos.find((p) => p.borda_id === bid && p.tamanho_id === tamId)?.preco ?? 0;
  const temPrecoSabor = (sid: string) => pizza.saborPrecos.some((p) => p.sabor_id === sid && p.tamanho_id === tamId);
  const saboresDoTam = pizza.sabores.filter((s) => temPrecoSabor(s.id));
  // Borda com preço cadastrado pro tamanho; se nenhuma tiver, mostra todas.
  const bordasComPreco = pizza.bordas.filter((b) => pizza.bordaPrecos.some((p) => p.borda_id === b.id && p.tamanho_id === tamId));
  const bordasDoTam = bordasComPreco.length ? bordasComPreco : pizza.bordas;
  const usados = sabIds.filter((s) => temPrecoSabor(s));
  const media = usados.length ? usados.reduce((s, id) => s + precoSabor(id), 0) / usados.length : 0;
  const preco = Math.round((media + (bordaId ? precoBorda(bordaId) : 0)) * 100) / 100;
  // "A partir de": o sabor mais barato do tamanho.
  const aPartir = (tid: string) => {
    const ps = pizza.saborPrecos.filter((p) => p.tamanho_id === tid).map((p) => Number(p.preco));
    return ps.length ? Math.min(...ps) : 0;
  };

  const etapas: Etapa[] = [
    ...(tamanhoInicial ? [] : (["tamanho"] as Etapa[])),
    ...(bordasDoTam.length ? (["bordas"] as Etapa[]) : []),
    "sabores",
    ...(comObs ? (["obs"] as Etapa[]) : []),
  ];
  const [etapa, setEtapa] = useState<Etapa>(etapas[0]);
  const idx = Math.max(0, etapas.indexOf(etapa));
  const ultima = idx === etapas.length - 1;

  function escolherTamanho(id: string) {
    const novo = pizza.tamanhos.find((t) => t.id === id);
    setTamId(id);
    // Sabor que não existe no tamanho novo sai; passa do máximo, corta.
    setSabIds((c) => c.filter((s) => pizza.saborPrecos.some((p) => p.sabor_id === s && p.tamanho_id === id)).slice(0, novo?.max_sabores ?? 1));
    setBordaId("");
    const prox = etapas[etapas.indexOf("tamanho") + 1];
    if (prox) setEtapa(prox);
  }
  function maisSabor(id: string) {
    setSabIds((c) => (max === 1 ? (c[0] === id ? [] : [id]) : c.length < max ? [...c, id] : c));
  }
  function menosSabor(id: string) {
    setSabIds((c) => { const i = c.lastIndexOf(id); return i < 0 ? c : [...c.slice(0, i), ...c.slice(i + 1)]; });
  }
  function adicionar() {
    if (!tam || usados.length === 0) return;
    const nomes = nomesDosSabores(usados, (id) => pizza.sabores.find((s) => s.id === id)?.nome ?? "?");
    const bordaNome = bordaId ? pizza.bordas.find((b) => b.id === bordaId)?.nome : "";
    const o = obs.trim();
    onAdd({
      uid: novoUid(),
      descricao: `${tam.nome} — ${nomes}` + (bordaNome ? ` · borda ${bordaNome}` : "") + (o ? `\nObs: ${o}` : ""),
      preco, qtd: 1,
      payload: { kind: "pizza", tamanhoId: tamId, saborIds: usados, bordaId: bordaId || null, qtd: 1, obs: o || undefined },
    });
  }
  function proximo() {
    if (etapa === "tamanho" && !tam) return;
    if (ultima) { adicionar(); return; }
    setEtapa(etapas[idx + 1]);
    setBuscaOn(false);
    setBusca("");
  }
  function voltar() {
    if (idx === 0) { onClose(); return; }
    setEtapa(etapas[idx - 1]);
  }
  const podeAvancar = etapa === "tamanho" ? !!tam : etapa === "sabores" ? usados.length > 0 : true;
  const podeConfirmar = !!tam && usados.length > 0;

  // Busca: acha pelo começo do nome primeiro, depois por qualquer parte (sem acento).
  const q = semAcento(busca.trim());
  const listaSabores = !q
    ? saboresDoTam
    : saboresDoTam
        .filter((s) => semAcento(s.nome).includes(q))
        .sort((a, b) => Number(!semAcento(b.nome).startsWith(q)) - Number(!semAcento(a.nome).startsWith(q)));

  const aba = (ativa: boolean) =>
    `min-h-11 shrink-0 rounded-full px-3 text-sm font-bold ${ativa ? "bg-texto text-fundo" : "bg-superficie-suave text-texto"}`;
  const linha = (on: boolean) =>
    `flex w-full items-center gap-3 rounded-cartao p-3 text-left ${on ? "bg-destaque shadow-[inset_0_0_0_2px_var(--marca-primaria)]" : "bg-painel-cartao shadow-cartao"}`;
  const redondo = "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl font-bold";

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/50 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Montar pizza"
        className="area-segura flex h-full w-full max-w-lg flex-col bg-painel-fundo text-texto sm:h-[90vh] sm:rounded-cartao sm:pb-0 sm:pt-0"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Topo */}
        <div className="flex items-center gap-3 border-b border-borda px-4 py-3">
          <h2 className="min-w-0 flex-1 truncate font-numero text-xl font-bold">{tam ? tam.nome : "Montar pizza"}</h2>
          <button onClick={onClose} aria-label="Fechar" className="flex h-11 w-11 items-center justify-center rounded-full text-2xl text-texto-suave">✕</button>
        </div>

        {/* Etapas */}
        <div className="flex items-center gap-2 px-4 py-3">
          <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto">
            {etapas.map((e) => (
              <button key={e} type="button" onClick={() => (e === "tamanho" || tam) && setEtapa(e)} aria-current={etapa === e ? "step" : undefined} className={aba(etapa === e)}>
                {ROTULO_ETAPA[e]}
              </button>
            ))}
          </div>
          {tam && max > 1 && (
            <span className={`shrink-0 rounded-full px-3 py-1.5 font-numero text-sm font-bold ${usados.length > 0 ? "bg-emerald-700 text-white" : "bg-superficie-suave text-texto-suave"}`}>
              {usados.length > 0 ? "✓ " : ""}{usados.length}/{max}
            </span>
          )}
          {etapa === "sabores" && (
            <button type="button" onClick={() => { setBuscaOn((v) => !v); setBusca(""); }} aria-label={buscaOn ? "Fechar busca" : "Buscar sabor"} className={`${redondo} text-texto-suave`}>
              {buscaOn ? "✕" : <Icone nome="buscar" tamanho={22} titulo="Buscar sabor" />}
            </button>
          )}
        </div>
        {etapa === "sabores" && buscaOn && (
          <div className="px-4 pb-2">
            <input
              autoFocus
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar sabor…"
              className="min-h-11 w-full rounded-controle border border-borda-forte bg-painel-cartao px-3 text-base text-texto"
            />
          </div>
        )}

        {/* Conteúdo da etapa */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {etapa === "tamanho" && (
            <div className="space-y-2">
              {pizza.tamanhos.map((t) => (
                <button key={t.id} type="button" onClick={() => escolherTamanho(t.id)} className={linha(tamId === t.id)}>
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-semibold">{t.nome}</span>
                    <span className="block text-sm text-texto-suave">
                      {t.max_sabores} sabor{t.max_sabores > 1 ? "es" : ""}{aPartir(t.id) ? ` · a partir de ${brl(aPartir(t.id))}` : ""}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {etapa === "bordas" && (
            <div className="space-y-2">
              <button type="button" onClick={() => setBordaId("")} className={linha(!bordaId)}>
                <span className="flex-1 text-base font-semibold">Sem borda</span>
                <span aria-hidden className={`h-6 w-6 rounded-full border-2 ${!bordaId ? "border-[var(--marca-primaria)] bg-[var(--marca-primaria)]" : "border-borda-forte"}`} />
              </button>
              {bordasDoTam.map((b) => (
                <button key={b.id} type="button" onClick={() => setBordaId(bordaId === b.id ? "" : b.id)} className={linha(bordaId === b.id)}>
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-semibold">{b.nome}</span>
                    {precoBorda(b.id) ? <span className="block text-sm text-texto-suave">+ {brl(precoBorda(b.id))}</span> : null}
                  </span>
                  <span aria-hidden className={`h-6 w-6 rounded-full border-2 ${bordaId === b.id ? "border-[var(--marca-primaria)] bg-[var(--marca-primaria)]" : "border-borda-forte"}`} />
                </button>
              ))}
            </div>
          )}

          {etapa === "sabores" && (
            <div className="space-y-2">
              {usados.length > 0 && (
                <p className="text-sm font-semibold text-texto">{nomesDosSabores(usados, (id) => pizza.sabores.find((s) => s.id === id)?.nome ?? "?")}</p>
              )}
              {listaSabores.length === 0 && <p className="py-8 text-center text-sm text-texto-fraco">Nenhum sabor com “{busca}”.</p>}
              {listaSabores.map((s) => {
                const n = sabIds.filter((x) => x === s.id).length;
                const cheio = max > 1 && usados.length >= max;
                return (
                  <div key={s.id} className={linha(n > 0)}>
                    {s.foto_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.foto_url} alt="" className="h-12 w-12 shrink-0 rounded-controle object-cover" />
                    )}
                    <button type="button" onClick={() => maisSabor(s.id)} disabled={n === 0 && cheio} className="min-w-0 flex-1 text-left disabled:opacity-50">
                      <span className="block text-base font-semibold leading-tight">
                        {s.nome}
                        {s.novo && <span className="pilula pilula-ok ml-1.5 align-middle text-[10px]">novo</span>}
                      </span>
                      {s.descricao && <span className="block text-xs leading-tight text-texto-suave">{s.descricao}</span>}
                      <span className="block text-sm text-texto-suave">{brl(precoSabor(s.id))}</span>
                    </button>
                    {n > 0 && max > 1 ? (
                      <div className="flex shrink-0 items-center gap-2">
                        <button type="button" onClick={() => menosSabor(s.id)} aria-label={`Tirar uma parte de ${s.nome}`} className={`${redondo} bg-texto text-fundo`}>−</button>
                        <span className="w-5 text-center font-numero text-lg font-bold">{n}</span>
                        <button type="button" onClick={() => maisSabor(s.id)} disabled={cheio} aria-label={`Mais uma parte de ${s.nome}`} className={`${redondo} bg-texto text-fundo disabled:opacity-30`}>+</button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => maisSabor(s.id)} disabled={n === 0 && cheio} aria-label={`Escolher ${s.nome}`} className={`${redondo} ${n > 0 ? "bg-texto text-fundo" : "text-texto"} disabled:opacity-30`}>
                        {n > 0 ? "✓" : "+"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {etapa === "obs" && (
            <div>
              <p className="mb-2 text-base font-semibold">Alguma observação para a cozinha?</p>
              <textarea
                value={obs}
                onChange={(e) => setObs(e.target.value.slice(0, 200))}
                rows={3}
                placeholder="Ex.: sem cebola, bem assada"
                className="w-full rounded-controle border border-borda-forte bg-painel-cartao px-3 py-2 text-base text-texto"
              />
            </div>
          )}
        </div>

        {/* Rodapé: total + Voltar/Próximo */}
        <div className="border-t border-borda px-4 pb-4 pt-3">
          <div className="mb-3 flex items-baseline justify-between">
            <span className="text-texto-suave">Total do pedido</span>
            <span className="font-numero text-2xl font-bold">{brl(preco)}</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={voltar} className="btn-secundario">{idx === 0 ? "Cancelar" : "Voltar"}</button>
            <button type="button" onClick={proximo} disabled={ultima ? !podeConfirmar : !podeAvancar} className="btn-principal">
              {ultima ? "Confirmar" : "Próximo"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Montador de item com etapas: combo do delivery (cada opção com o valor no
// combo; etapa de pizza cobra a média) ou marmita com complementos (+extras).
// Etapa que deixa repetir tem contador (−/+); as outras, toque liga/desliga.
export function ComboModal({ item, grupos, opcoesDe, onClose, onAdd, comObs }: {
  item: Item;
  grupos: Grupo[];
  opcoesDe: (grupoId: string) => Opcao[];
  onClose: () => void;
  onAdd: (l: CartLine) => void;
  comObs?: boolean;
}) {
  const [sel, setSel] = useState<Record<string, string[]>>({});
  const [obs, setObs] = useState("");
  const escolhidas = grupos.flatMap((g) => sel[g.id] ?? []);
  const opcaoById = useMemo(() => new Map(grupos.flatMap((g) => opcoesDe(g.id)).map((o) => [o.id, o])), [grupos, opcoesDe]);
  const preco = precoComEtapas(item.preco, grupos, Object.fromEntries(grupos.map((g) => [g.id, (sel[g.id] ?? []).map((id) => opcaoById.get(id)?.preco ?? 0)])));
  const problema = problemaDasEscolhas(grupos, sel);
  const combo = !!item.combo;

  function tocar(g: Grupo, opId: string) {
    setSel((c) => {
      const atual = c[g.id] ?? [];
      if (atual.includes(opId)) return { ...c, [g.id]: atual.filter((x) => x !== opId) };
      if (g.max === 1) return { ...c, [g.id]: [opId] };
      if (g.max > 0 && atual.length >= g.max) return c;
      return { ...c, [g.id]: [...atual, opId] };
    });
  }
  function mais(g: Grupo, opId: string) {
    setSel((c) => { const atual = c[g.id] ?? []; return g.max > 0 && atual.length >= g.max ? c : { ...c, [g.id]: [...atual, opId] }; });
  }
  function menos(g: Grupo, opId: string) {
    setSel((c) => { const atual = [...(c[g.id] ?? [])]; const i = atual.lastIndexOf(opId); if (i >= 0) atual.splice(i, 1); return { ...c, [g.id]: atual }; });
  }

  function adicionar() {
    const linhas: string[] = [];
    for (const g of grupos) {
      const ids = sel[g.id] ?? [];
      if (ids.length === 0) continue;
      const cont = new Map<string, number>();
      for (const id of ids) cont.set(id, (cont.get(id) || 0) + 1);
      const nomes = [...cont].map(([id, n]) => {
        const o = opcaoById.get(id);
        const nome = `${n > 1 ? `${n}× ` : ""}${o?.nome ?? "?"}`;
        return !combo && o && o.preco > 0 ? `${nome} (+${o.preco})` : nome;
      });
      if (combo) linhas.push(`${g.nome}: ${nomes.join(" / ")}`); else linhas.push(...nomes);
    }
    const o = obs.trim();
    const base = linhas.length ? `${item.nome}\n${linhas.map((n) => `- ${n}`).join("\n")}` : item.nome;
    onAdd({
      uid: novoUid(),
      descricao: base + (o ? `\nObs: ${o}` : ""),
      preco, qtd: 1,
      payload: { kind: "combo", itemId: item.id, opcaoIds: escolhidas, qtd: 1, obs: o || undefined },
    });
  }

  const regra = (g: Grupo) => g.max === 1 ? (g.min >= 1 ? "escolha 1" : "opcional, até 1")
    : g.min === g.max ? `escolha ${g.min}` : g.min > 0 ? `escolha de ${g.min} até ${g.max}` : `opcional, até ${g.max}`;

  return (
    <Overlay onClose={onClose} titulo={item.nome}>
      {item.descricao && <p className="-mt-2 mb-3 text-sm text-texto-suave">{item.descricao}</p>}
      <div className="max-h-[60vh] space-y-4 overflow-y-auto">
        {grupos.map((g, gi) => {
          const n = (sel[g.id] ?? []).length;
          return (
            <div key={g.id}>
              <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2 text-sm font-semibold text-texto">
                {combo && <span className="font-numero text-texto-marca">{gi + 1}.</span>} {g.nome}
                <span className={`text-xs font-normal ${n < g.min ? "text-texto-marca" : "text-texto-suave"}`}>({regra(g)}{g.max > 1 ? ` · ${n}/${g.max}` : ""}{g.media && g.max > 1 ? " · cobra a média dos sabores" : ""})</span>
              </div>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {opcoesDe(g.id).map((o) => {
                  const qtd = (sel[g.id] ?? []).filter((x) => x === o.id).length;
                  const valor = combo ? (o.preco > 0 ? brl(o.preco) : "") : o.preco > 0 ? `+${brl(o.preco)}` : "";
                  if (g.permite_repetir && g.max !== 1) return (
                    <div key={o.id} className={`flex min-h-11 items-center gap-2 rounded-controle border px-2 text-sm ${qtd ? "border-primaria bg-destaque" : "border-borda"}`}>
                      <span className="min-w-0 flex-1 truncate">{o.nome}{valor && <span className="ml-1 text-xs text-texto-suave">{valor}</span>}</span>
                      {qtd > 0 && <button type="button" onClick={() => menos(g, o.id)} aria-label={`Tirar ${o.nome}`} className="h-9 w-9 rounded-full border border-borda-forte font-bold">−</button>}
                      {qtd > 0 && <span className="w-4 text-center font-numero font-bold">{qtd}</span>}
                      <button type="button" onClick={() => mais(g, o.id)} disabled={g.max > 0 && n >= g.max} aria-label={`Pôr ${o.nome}`} className="h-9 w-9 rounded-full border border-borda-forte font-bold disabled:opacity-40">+</button>
                    </div>
                  );
                  return (
                    <button key={o.id} type="button" onClick={() => tocar(g, o.id)} aria-pressed={qtd > 0} className={`flex min-h-11 items-center justify-between gap-2 rounded-controle border px-3 text-left text-sm ${qtd ? "border-primaria bg-destaque" : "border-borda"}`}>
                      <span className="truncate">{o.nome}</span>{valor && <span className="shrink-0 text-xs text-texto-suave">{valor}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {comObs && (
        <input value={obs} onChange={(e) => setObs(e.target.value)} maxLength={200} placeholder="Observação (ex.: sem cebola)" className="mt-3 min-h-11 w-full rounded-controle border border-borda-forte bg-transparent px-3 text-sm" />
      )}
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-borda pt-3">
        <div>
          <div className="font-numero text-lg font-bold">{brl(preco)}</div>
          {problema && <div className="text-xs text-texto-suave">{problema}</div>}
        </div>
        <button onClick={adicionar} disabled={!!problema} className="btn-principal text-sm">Adicionar</button>
      </div>
    </Overlay>
  );
}

export function Overlay({ titulo, children, onClose }: { titulo: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">{titulo}</h2>
          <button onClick={onClose} className="text-zinc-400">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
