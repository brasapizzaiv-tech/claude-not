"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { criarPedidoDelivery, buscarClientePorTelefone, calcularEntrega } from "../actions";
import {
  PizzaModal, ComboModal, brl, novoUid,
  type Item, type Grupo, type Opcao, type PizzaData, type CartLine,
} from "@/components/delivery-pedido-ui";

const FORMAS = ["Dinheiro", "Pix", "Cartão de crédito", "Cartão de débito"];
const ORIGENS: [string, string][] = [["whatsapp", "🟢 WhatsApp"], ["instagram", "📸 Instagram"], ["telefone", "📞 Telefone"], ["balcao", "🏪 Balcão"]];

export function NovoPedido({
  itens, categorias, comComplemento, pizza, complementos, cfg,
}: {
  itens: Item[];
  categorias: string[];
  comComplemento: string[];
  pizza: PizzaData;
  complementos: { grupos: Grupo[]; opcoes: Opcao[] };
  cfg: { taxaBase: number; precoKm: number; tempoPreparo: number };
}) {
  const router = useRouter();
  const [proc, start] = useTransition();
  const [aba, setAba] = useState(categorias[0] ?? "");
  const [busca, setBusca] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);

  // cliente / entrega
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [sugestoes, setSugestoes] = useState<Awaited<ReturnType<typeof buscarClientePorTelefone>>>([]);
  const [tipo, setTipo] = useState<"entrega" | "retirada">("entrega");
  const [end, setEnd] = useState({ logradouro: "", numero: "", complemento: "", bairro: "", cidade: "Ivoti", referencia: "", cep: "" });
  const [taxa, setTaxa] = useState<string>(String(cfg.taxaBase || ""));
  const [geo, setGeo] = useState<{ km: number; lat: number; lng: number; aprox: boolean; fora: boolean } | null>(null);
  const [calcMsg, setCalcMsg] = useState<string | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [desconto, setDesconto] = useState("");
  const [descMotivo, setDescMotivo] = useState("");
  const [forma, setForma] = useState("Dinheiro");
  const [trocoPara, setTrocoPara] = useState("");
  const [origem, setOrigem] = useState<string>("whatsapp");
  const [obs, setObs] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const comComplSet = useMemo(() => new Set(comComplemento), [comComplemento]);
  const gruposDe = (itemId: string) => complementos.grupos.filter((g) => g.item_id === itemId);
  const opcoesDe = (grupoId: string) => complementos.opcoes.filter((o) => o.grupo_id === grupoId);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return itens.filter((i) => (!q ? i.categoria === aba : i.nome.toLowerCase().includes(q)));
  }, [itens, aba, busca]);

  const subtotal = cart.reduce((s, l) => s + l.preco * l.qtd, 0);
  const taxaN = tipo === "retirada" ? 0 : Number(taxa.replace(",", ".")) || 0;
  const descN = Number(desconto.replace(",", ".")) || 0;
  const total = Math.round((subtotal + taxaN - descN) * 100) / 100;
  const trocoN = forma === "Dinheiro" ? Number(trocoPara.replace(",", ".")) || 0 : 0;

  // ---- modais ----
  const [pzOpen, setPzOpen] = useState(false);
  const [comboItem, setComboItem] = useState<Item | null>(null);

  function addLinha(l: CartLine) { setCart((c) => [...c, l]); }
  function setQtd(uid: string, q: number) { setCart((c) => c.map((l) => (l.uid === uid ? { ...l, qtd: q } : l)).filter((l) => l.qtd > 0)); }

  function clicarItem(i: Item) {
    if (comComplSet.has(i.id) && gruposDe(i.id).length) { setComboItem(i); return; }
    addLinha({ uid: novoUid(), descricao: i.nome, preco: i.preco, qtd: 1, payload: { kind: "item", itemId: i.id, qtd: 1 } });
  }

  async function buscarCliente(v: string) {
    setTelefone(v); setClienteId(null);
    const digs = v.replace(/\D/g, "");
    if (digs.length >= 4) setSugestoes(await buscarClientePorTelefone(digs));
    else setSugestoes([]);
  }
  function escolherCliente(c: Awaited<ReturnType<typeof buscarClientePorTelefone>>[number]) {
    setClienteId(c.id); setNome(c.nome); setTelefone(c.telefone ?? "");
    setEnd({ logradouro: c.logradouro ?? "", numero: c.numero ?? "", complemento: c.complemento ?? "", bairro: c.bairro ?? "", cidade: c.municipio ?? "Ivoti", referencia: "", cep: c.cep ?? "" });
    setSugestoes([]);
  }

  async function calcularTaxa() {
    if (!end.logradouro.trim()) { setCalcMsg("Preencha a rua primeiro."); return; }
    setCalculando(true); setCalcMsg(null);
    const r = await calcularEntrega({ logradouro: end.logradouro, numero: end.numero, bairro: end.bairro, cidade: end.cidade, cep: end.cep });
    setCalculando(false);
    if (r.ok) {
      setTaxa(String(r.taxa));
      setGeo({ km: r.distanciaKm, lat: r.lat, lng: r.lng, aprox: r.aproximado, fora: r.foraDeArea });
      setCalcMsg(`${r.distanciaKm} km${r.aproximado ? " (aprox.)" : ""}${r.foraDeArea ? " · ⚠️ fora da área!" : ""}`);
    } else {
      setGeo(null);
      setCalcMsg(r.mensagem ?? "Não consegui calcular.");
    }
  }

  function finalizar() {
    if (cart.length === 0) { setErro("Adicione itens ao pedido."); return; }
    if (!nome.trim()) { setErro("Informe o nome do cliente."); return; }
    setErro(null);
    start(async () => {
      const r = await criarPedidoDelivery({
        clienteId, nome, telefone, tipo,
        endereco: tipo === "entrega" ? end : undefined,
        distanciaKm: geo?.km ?? null, lat: geo?.lat ?? null, lng: geo?.lng ?? null,
        taxaEntrega: taxaN, desconto: descN, descontoMotivo: descMotivo,
        formaPagamento: forma, trocoPara: trocoN || null,
        origem: origem as "app" | "whatsapp" | "instagram" | "telefone" | "balcao",
        observacao: obs,
        itens: cart.map((l) => ({ ...l.payload, qtd: l.qtd })),
      });
      if (r.ok) router.push("/delivery");
      else setErro(("mensagem" in r && r.mensagem) || "Não foi possível criar o pedido.");
    });
  }

  return (
    <div className="flex h-[calc(100vh-1rem)] gap-3 p-3">
      {/* Cardápio */}
      <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-2 border-b border-zinc-200 p-3 dark:border-zinc-800">
          <Link href="/delivery" className="text-emerald-600">← Voltar</Link>
          <h1 className="text-lg font-bold">Novo pedido</h1>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar produto..." className="ml-auto w-64 rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none dark:border-zinc-700" />
        </div>
        {!busca && (
          <div className="flex flex-wrap gap-1.5 border-b border-zinc-200 p-2 dark:border-zinc-800">
            {pizza.tamanhos.length > 0 && (
              <button onClick={() => setPzOpen(true)} className="rounded-lg bg-orange-500/10 px-3 py-1.5 text-sm font-bold text-orange-600">🍕 Montar pizza</button>
            )}
            {categorias.map((c) => (
              <button key={c} onClick={() => setAba(c)} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${aba === c ? "bg-zinc-100 dark:bg-zinc-800" : "text-zinc-500"}`}>{c}</button>
            ))}
          </div>
        )}
        <div className="grid flex-1 grid-cols-2 content-start gap-2 overflow-y-auto p-3 sm:grid-cols-3 lg:grid-cols-4">
          {visiveis.map((i) => (
            <button key={i.id} onClick={() => clicarItem(i)} className="flex min-h-[72px] flex-col justify-between rounded-xl border border-zinc-200 p-2.5 text-left hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900">
              <span className="text-sm font-medium leading-tight">{i.nome}{comComplSet.has(i.id) ? " ⚙️" : ""}</span>
              <span className="text-sm text-emerald-600">{i.preco > 0 ? brl(i.preco) : "—"}</span>
            </button>
          ))}
          {visiveis.length === 0 && <p className="col-span-full py-10 text-center text-sm text-zinc-500">Nenhum produto.</p>}
        </div>
      </div>

      {/* Pedido / cliente / pagamento */}
      <div className="flex w-96 shrink-0 flex-col overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
        <div className="flex-1 space-y-3 overflow-y-auto p-3">
          {/* Cliente */}
          <div className="relative">
            <label className="text-xs font-semibold text-zinc-500">Telefone</label>
            <input value={telefone} onChange={(e) => buscarCliente(e.target.value)} placeholder="(51) 9...." className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none dark:border-zinc-700" />
            {sugestoes.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                {sugestoes.map((s) => (
                  <button key={s.id} onClick={() => escolherCliente(s)} className="block w-full px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">
                    <div className="font-medium">{s.nome}</div>
                    <div className="text-xs text-zinc-500">{s.telefone} · {s.bairro ?? "sem bairro"}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="text-xs font-semibold text-zinc-500">Nome</label>
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do cliente" className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none dark:border-zinc-700" />
          </div>

          {/* Tipo */}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setTipo("entrega")} className={`rounded-lg border py-2 text-sm font-semibold ${tipo === "entrega" ? "border-emerald-500 bg-emerald-500/10 text-emerald-600" : "border-zinc-200 text-zinc-500 dark:border-zinc-800"}`}>🛵 Entrega</button>
            <button onClick={() => setTipo("retirada")} className={`rounded-lg border py-2 text-sm font-semibold ${tipo === "retirada" ? "border-emerald-500 bg-emerald-500/10 text-emerald-600" : "border-zinc-200 text-zinc-500 dark:border-zinc-800"}`}>🏃 Retirada</button>
          </div>

          {/* Endereço */}
          {tipo === "entrega" && (
            <div className="space-y-2 rounded-xl bg-zinc-50 p-2 dark:bg-zinc-900">
              <div className="grid grid-cols-3 gap-2">
                <input value={end.logradouro} onChange={(e) => setEnd({ ...end, logradouro: e.target.value })} placeholder="Rua" className="col-span-2 rounded-lg border border-zinc-300 bg-transparent px-2 py-1.5 text-sm outline-none dark:border-zinc-700" />
                <input value={end.numero} onChange={(e) => setEnd({ ...end, numero: e.target.value })} placeholder="Nº" className="rounded-lg border border-zinc-300 bg-transparent px-2 py-1.5 text-sm outline-none dark:border-zinc-700" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input value={end.bairro} onChange={(e) => setEnd({ ...end, bairro: e.target.value })} placeholder="Bairro" className="rounded-lg border border-zinc-300 bg-transparent px-2 py-1.5 text-sm outline-none dark:border-zinc-700" />
                <input value={end.cidade} onChange={(e) => setEnd({ ...end, cidade: e.target.value })} placeholder="Cidade" className="rounded-lg border border-zinc-300 bg-transparent px-2 py-1.5 text-sm outline-none dark:border-zinc-700" />
              </div>
              <input value={end.complemento} onChange={(e) => setEnd({ ...end, complemento: e.target.value })} placeholder="Complemento (apto, casa...)" className="w-full rounded-lg border border-zinc-300 bg-transparent px-2 py-1.5 text-sm outline-none dark:border-zinc-700" />
              <input value={end.referencia} onChange={(e) => setEnd({ ...end, referencia: e.target.value })} placeholder="Ponto de referência" className="w-full rounded-lg border border-zinc-300 bg-transparent px-2 py-1.5 text-sm outline-none dark:border-zinc-700" />
              <button type="button" onClick={calcularTaxa} disabled={calculando} className="w-full rounded-lg border border-emerald-500 py-1.5 text-sm font-semibold text-emerald-600 disabled:opacity-50">{calculando ? "Calculando..." : "📍 Calcular taxa pela distância"}</button>
              {calcMsg && (
                <p className={`text-xs ${geo?.fora ? "text-rose-600" : "text-zinc-500"}`}>
                  {calcMsg}
                  {geo && (
                    <>
                      {" · "}
                      <a href={`https://www.google.com/maps/search/?api=1&query=${geo.lat},${geo.lng}`} target="_blank" rel="noreferrer" className="font-semibold text-emerald-600 hover:underline">conferir no mapa</a>
                    </>
                  )}
                </p>
              )}
            </div>
          )}

          {/* Itens */}
          <div>
            <div className="mb-1 text-xs font-semibold text-zinc-500">Itens</div>
            {cart.length === 0 ? (
              <p className="rounded-lg border border-dashed border-zinc-300 py-4 text-center text-sm text-zinc-400 dark:border-zinc-700">Toque nos produtos</p>
            ) : (
              <div className="space-y-1.5">
                {cart.map((l) => (
                  <div key={l.uid} className="flex items-start justify-between gap-2 rounded-lg border border-zinc-200 p-2 dark:border-zinc-800">
                    <div className="min-w-0 flex-1">
                      <div className="whitespace-pre-line text-sm font-medium leading-tight">{l.descricao}</div>
                      <div className="text-xs text-emerald-600">{brl(l.preco * l.qtd)}</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => setQtd(l.uid, l.qtd - 1)} className="h-6 w-6 rounded border border-zinc-300 dark:border-zinc-600">{l.qtd === 1 ? "🗑️" : "−"}</button>
                      <span className="w-4 text-center text-sm font-bold">{l.qtd}</span>
                      <button onClick={() => setQtd(l.uid, l.qtd + 1)} className="h-6 w-6 rounded border border-zinc-300 text-emerald-600 dark:border-zinc-600">+</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pagamento */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-semibold text-zinc-500">Forma</label>
              <select value={forma} onChange={(e) => setForma(e.target.value)} className="w-full rounded-lg border border-zinc-300 bg-transparent px-2 py-2 text-sm dark:border-zinc-700">
                {FORMAS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-500">Origem</label>
              <select value={origem} onChange={(e) => setOrigem(e.target.value)} className="w-full rounded-lg border border-zinc-300 bg-transparent px-2 py-2 text-sm dark:border-zinc-700">
                {ORIGENS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          {forma === "Dinheiro" && (
            <input value={trocoPara} onChange={(e) => setTrocoPara(e.target.value)} inputMode="decimal" placeholder="Troco para quanto? (opcional)" className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none dark:border-zinc-700" />
          )}
          <div className="grid grid-cols-2 gap-2">
            {tipo === "entrega" && (
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-zinc-500">Taxa entrega</label>
                  <button type="button" onClick={calcularTaxa} disabled={calculando} className="text-xs font-semibold text-emerald-600 disabled:opacity-50">{calculando ? "..." : "📍 calcular"}</button>
                </div>
                <input value={taxa} onChange={(e) => setTaxa(e.target.value)} inputMode="decimal" placeholder="0,00" className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none dark:border-zinc-700" />
              </div>
            )}
            <div>
              <label className="text-xs font-semibold text-zinc-500">Desconto</label>
              <input value={desconto} onChange={(e) => setDesconto(e.target.value)} inputMode="decimal" placeholder="0,00" className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none dark:border-zinc-700" />
            </div>
          </div>
          {descN > 0 && (
            <input value={descMotivo} onChange={(e) => setDescMotivo(e.target.value)} placeholder="Motivo do desconto" className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none dark:border-zinc-700" />
          )}
          <textarea value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Observação (opcional)" rows={2} className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none dark:border-zinc-700" />
        </div>

        {/* Rodapé */}
        <div className="border-t border-zinc-200 p-3 dark:border-zinc-800">
          <div className="mb-1 flex justify-between text-sm text-zinc-500"><span>Subtotal</span><span>{brl(subtotal)}</span></div>
          {tipo === "entrega" && <div className="mb-1 flex justify-between text-sm text-zinc-500"><span>Taxa</span><span>{brl(taxaN)}</span></div>}
          {descN > 0 && <div className="mb-1 flex justify-between text-sm text-rose-500"><span>Desconto</span><span>− {brl(descN)}</span></div>}
          <div className="mb-2 flex justify-between text-lg font-bold"><span>Total</span><span>{brl(total)}</span></div>
          {forma === "Dinheiro" && trocoN > total && <div className="mb-2 flex justify-between text-sm text-amber-600"><span>Troco</span><span>{brl(Math.round((trocoN - total) * 100) / 100)}</span></div>}
          {erro && <p className="mb-2 text-sm text-red-500">{erro}</p>}
          <button onClick={finalizar} disabled={proc} className="w-full rounded-xl bg-emerald-600 py-3 text-base font-bold text-white disabled:opacity-50">{proc ? "Criando..." : "✅ Criar pedido"}</button>
        </div>
      </div>

      {pzOpen && <PizzaModal pizza={pizza} onClose={() => setPzOpen(false)} onAdd={(l) => { addLinha(l); setPzOpen(false); }} />}
      {comboItem && <ComboModal item={comboItem} grupos={gruposDe(comboItem.id)} opcoesDe={opcoesDe} onClose={() => setComboItem(null)} onAdd={(l) => { addLinha(l); setComboItem(null); }} />}
    </div>
  );
}
