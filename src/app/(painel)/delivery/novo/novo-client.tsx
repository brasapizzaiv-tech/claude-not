"use client";

import { Icone } from "@/components/icone";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { criarPedidoDelivery, buscarClientePorTelefone, calcularEntrega, editarPedidoDelivery } from "../actions";
import {
  PizzaModal, ComboModal, brl, novoUid,
  type Item, type Grupo, type Opcao, type PizzaData, type CartLine,
} from "@/components/delivery-pedido-ui";
import { tipoDe, type FormaOpcao } from "@/lib/formas-pagamento";

const ORIGENS: [string, string][] = [["whatsapp", "WhatsApp"], ["instagram", "Instagram"], ["telefone", "Telefone"], ["balcao", "Balcão"]];

const numTxt = (n: number) => (n ? String(n).replace(".", ",") : "");

/** Pedido já lançado, aberto pra editar (itens e endereço — 27/11/2026). */
export type EditarPedido = {
  id: string;
  numero: number | null;
  nome: string;
  telefone: string;
  clienteId: string | null;
  tipo: "entrega" | "retirada";
  end: { logradouro: string; numero: string; complemento: string; bairro: string; cidade: string; referencia: string; cep: string };
  taxa: number;
  desconto: number;
  descMotivo: string;
  forma: string;
  troco: number | null;
  obs: string;
  pago: boolean;
  /** Itens que já estão no pedido: dá pra mudar a quantidade ou tirar. */
  existentes: { id: string; descricao: string; qtd: number; preco: number }[];
};

export function NovoPedido({
  itens, categorias, comComplemento, pizza, complementos, cfg, formas, editar,
}: {
  itens: Item[];
  categorias: string[];
  comComplemento: string[];
  pizza: PizzaData;
  complementos: { grupos: Grupo[]; opcoes: Opcao[] };
  cfg: { taxaBase: number; precoKm: number; tempoPreparo: number };
  formas: FormaOpcao[];
  editar?: EditarPedido;
}) {
  const router = useRouter();
  const [proc, start] = useTransition();
  const [aba, setAba] = useState(categorias[0] ?? "");
  const [busca, setBusca] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  // Editando: os itens que já estavam (quantidade nova; 0 = tirar).
  const [existentes, setExistentes] = useState(() => editar?.existentes ?? []);

  // cliente / entrega
  const [nome, setNome] = useState(editar?.nome ?? "");
  const [telefone, setTelefone] = useState(editar?.telefone ?? "");
  const [clienteId, setClienteId] = useState<string | null>(editar?.clienteId ?? null);
  const [sugestoes, setSugestoes] = useState<Awaited<ReturnType<typeof buscarClientePorTelefone>>>([]);
  const [tipo, setTipo] = useState<"entrega" | "retirada">(editar?.tipo ?? "entrega");
  const [end, setEnd] = useState(editar?.end ?? { logradouro: "", numero: "", complemento: "", bairro: "", cidade: "Ivoti", referencia: "", cep: "" });
  const [taxa, setTaxa] = useState<string>(editar ? numTxt(editar.taxa) : String(cfg.taxaBase || ""));
  const [geo, setGeo] = useState<{ km: number | null; lat: number; lng: number; aprox: boolean; fora: boolean; areaId: string | null; areaNome: string | null } | null>(null);
  const [calcMsg, setCalcMsg] = useState<string | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [desconto, setDesconto] = useState(editar ? numTxt(editar.desconto) : "");
  const [descMotivo, setDescMotivo] = useState(editar?.descMotivo ?? "");
  const [forma, setForma] = useState(editar?.forma || (formas[0]?.nome ?? "Dinheiro"));
  const [trocoPara, setTrocoPara] = useState(editar?.troco ? numTxt(editar.troco) : "");
  const [agendar, setAgendar] = useState(""); // "YYYY-MM-DDTHH:MM" (horário de SP) ou vazio
  const [origem, setOrigem] = useState<string>("whatsapp");
  const [obs, setObs] = useState(editar?.obs ?? "");
  const [erro, setErro] = useState<string | null>(null);
  // Forma do pedido que não está na lista (ex.: "Pix online"): continua escolhível.
  const formasLista = editar?.forma && !formas.some((f) => f.nome === editar.forma) ? [...formas, { nome: editar.forma } as FormaOpcao] : formas;

  const comComplSet = useMemo(() => new Set(comComplemento), [comComplemento]);
  const gruposDe = (itemId: string) => complementos.grupos.filter((g) => g.item_id === itemId);
  const opcoesDe = (grupoId: string) => complementos.opcoes.filter((o) => o.grupo_id === grupoId);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return itens.filter((i) => (!q ? i.categoria === aba : i.nome.toLowerCase().includes(q)));
  }, [itens, aba, busca]);

  const subtotal = cart.reduce((s, l) => s + l.preco * l.qtd, 0) + existentes.reduce((s, l) => s + l.preco * l.qtd, 0);
  function setQtdExistente(id: string, q: number) { setExistentes((e) => e.map((l) => (l.id === id ? { ...l, qtd: Math.max(0, q) } : l))); }
  const temItens = cart.length > 0 || existentes.some((l) => l.qtd > 0);
  const taxaN = tipo === "retirada" ? 0 : Number(taxa.replace(",", ".")) || 0;
  const descN = Number(desconto.replace(",", ".")) || 0;
  const total = Math.round((subtotal + taxaN - descN) * 100) / 100;
  const trocoN = tipoDe(forma, formas) === "dinheiro" ? Number(trocoPara.replace(",", ".")) || 0 : 0;

  // ---- modais ----
  const [pzOpen, setPzOpen] = useState(false);
  const [comboItem, setComboItem] = useState<Item | null>(null);

  function addLinha(l: CartLine) { setCart((c) => [...c, l]); }
  function setQtd(uid: string, q: number) { setCart((c) => c.map((l) => (l.uid === uid ? { ...l, qtd: q } : l)).filter((l) => l.qtd > 0)); }
  // Observação por item (sai embaixo do item na comanda da cozinha).
  function setObsLinha(uid: string, v: string) { setCart((c) => c.map((l) => (l.uid === uid ? { ...l, payload: { ...l.payload, obs: v || undefined } } : l))); }

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
      setGeo({ km: r.distanciaKm, lat: r.lat, lng: r.lng, aprox: r.aproximado, fora: r.foraDeArea, areaId: r.areaId ?? null, areaNome: r.areaNome ?? null });
      setCalcMsg(`${r.areaNome ? `área ${r.areaNome}` : `${r.distanciaKm} km${r.aproximado ? " (aprox.)" : ""}`}${r.foraDeArea ? " · fora da área!" : ""}`);
    } else {
      setGeo(null);
      setCalcMsg(r.mensagem ?? "Não consegui calcular.");
    }
  }

  function finalizar() {
    if (!temItens) { setErro("Adicione itens ao pedido."); return; }
    if (!nome.trim()) { setErro("Informe o nome do cliente."); return; }
    setErro(null);
    if (editar) {
      start(async () => {
        const r = await editarPedidoDelivery(editar.id, {
          nome, tipo,
          endereco: tipo === "entrega" ? end : null,
          geo: geo ? { distanciaKm: geo.km, lat: geo.lat, lng: geo.lng, areaId: geo.areaId, areaNome: geo.areaNome } : null,
          taxaEntrega: taxaN, desconto: descN, descontoMotivo: descMotivo,
          formaPagamento: forma, trocoPara: trocoN || null,
          observacao: obs,
          existentes: existentes.map((l) => ({ id: l.id, qtd: l.qtd })),
          novos: cart.map((l) => ({ ...l.payload, qtd: l.qtd })),
        });
        if (r.ok) router.push(`/delivery/${editar.id}`);
        else setErro(r.mensagem);
      });
      return;
    }
    start(async () => {
      const r = await criarPedidoDelivery({
        clienteId, nome, telefone, tipo,
        endereco: tipo === "entrega" ? end : undefined,
        distanciaKm: geo?.km ?? null, lat: geo?.lat ?? null, lng: geo?.lng ?? null,
        areaId: geo?.areaId ?? null, areaNome: geo?.areaNome ?? null,
        taxaEntrega: taxaN, desconto: descN, descontoMotivo: descMotivo,
        formaPagamento: forma, trocoPara: trocoN || null,
        agendadoPara: agendar ? new Date(agendar + ":00-03:00").toISOString() : null,
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
      <div className="flex flex-1 flex-col overflow-hidden rounded-cartao bg-painel-cartao">
        <div className="flex items-center gap-2 border-b border-borda p-3">
          <Link href={editar ? `/delivery/${editar.id}` : "/delivery"} className="font-semibold text-texto-marca hover:underline">← Voltar</Link>
          <h1 className="text-lg font-bold">{editar ? `Editar pedido nº ${editar.numero ?? "—"}` : "Novo pedido"}</h1>
          <input aria-label="Buscar produto" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar produto..." className="campo ml-auto w-64" />
        </div>
        {!busca && (
          <div className="flex flex-wrap gap-1.5 border-b border-borda p-2">
            {pizza.tamanhos.length > 0 && (
              <button onClick={() => setPzOpen(true)} className="rounded-controle bg-orange-500/10 px-3 py-1.5 text-sm font-bold text-orange-600"><span className="inline-flex items-center gap-1.5"><Icone nome="pizza" tamanho={14} /> Montar pizza</span></button>
            )}
            {categorias.map((c) => (
              <button key={c} onClick={() => setAba(c)} className={`rounded-controle px-3 py-1.5 text-sm font-medium ${aba === c ? "bg-superficie-suave" : "text-texto-suave"}`}>{c}</button>
            ))}
          </div>
        )}
        <div className="grid flex-1 grid-cols-2 content-start gap-2 overflow-y-auto p-3 sm:grid-cols-3 lg:grid-cols-4">
          {visiveis.map((i) => (
            <button key={i.id} onClick={() => clicarItem(i)} className="flex min-h-[72px] flex-col justify-between cartao p-2.5 text-left hover:bg-superficie-suave">
              <span className="text-sm font-medium leading-tight">{i.nome}{comComplSet.has(i.id) && <Icone nome="ajustes" tamanho={12} className="ml-1 text-texto-fraco" />}</span>
              <span className="text-sm text-ok-texto">{i.a_partir != null ? `a partir de ${brl(i.a_partir)}` : i.preco > 0 ? brl(i.preco) : "—"}</span>
            </button>
          ))}
          {visiveis.length === 0 && <p className="col-span-full py-10 text-center text-sm text-texto-suave">Nenhum produto com esse nome nesta categoria. Tente outra palavra ou outra categoria.</p>}
        </div>
      </div>

      {/* Pedido / cliente / pagamento */}
      <div className="flex w-96 shrink-0 flex-col overflow-hidden rounded-cartao bg-painel-cartao">
        <div className="flex-1 space-y-3 overflow-y-auto p-3">
          {/* Cliente */}
          <div className="relative">
            <label className="text-xs font-semibold text-texto-suave">Telefone</label>
            {/* Editando: o telefone se troca no próprio pedido ("Corrigir telefone"). */}
            <input aria-label="(51) 9." value={telefone} onChange={(e) => buscarCliente(e.target.value)} readOnly={!!editar} placeholder="(51) 9...." className={`campo w-full ${editar ? "opacity-60" : ""}`} />
            {sugestoes.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-controle border border-borda bg-painel-cartao dark:border-borda-forte">
                {sugestoes.map((s) => (
                  <button key={s.id} onClick={() => escolherCliente(s)} className="block w-full px-3 py-2 text-left text-sm hover:bg-superficie-suave">
                    <div className="font-medium">{s.nome}</div>
                    <div className="text-xs text-texto-suave">{s.telefone} · {s.bairro ?? "sem bairro"}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="text-xs font-semibold text-texto-suave">Nome</label>
            <input aria-label="Nome do cliente" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do cliente" className="campo w-full" />
          </div>

          {/* Tipo */}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setTipo("entrega")} className={`rounded-controle border py-2 text-sm font-semibold ${tipo === "entrega" ? "border-emerald-500 bg-emerald-500/10 text-ok-texto" : "border-borda text-texto-suave "}`}><span className="inline-flex items-center justify-center gap-1.5"><Icone nome="entrega" tamanho={14} /> Entrega</span></button>
            <button onClick={() => setTipo("retirada")} className={`rounded-controle border py-2 text-sm font-semibold ${tipo === "retirada" ? "border-emerald-500 bg-emerald-500/10 text-ok-texto" : "border-borda text-texto-suave "}`}><span className="inline-flex items-center justify-center gap-1.5"><Icone nome="loja" tamanho={14} /> Retirada</span></button>
          </div>

          {/* Endereço */}
          {tipo === "entrega" && (
            <div className="space-y-2 rounded-cartao bg-superficie-suave p-2">
              <div className="grid grid-cols-3 gap-2">
                <input aria-label="Rua" value={end.logradouro} onChange={(e) => setEnd({ ...end, logradouro: e.target.value })} placeholder="Rua" className="col-span-2 rounded-controle border border-borda-forte bg-transparent px-2 py-1.5 text-sm " />
                <input aria-label="Nº" value={end.numero} onChange={(e) => setEnd({ ...end, numero: e.target.value })} placeholder="Nº" className="rounded-controle border border-borda-forte bg-transparent px-2 py-1.5 text-sm " />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input aria-label="Bairro" value={end.bairro} onChange={(e) => setEnd({ ...end, bairro: e.target.value })} placeholder="Bairro" className="rounded-controle border border-borda-forte bg-transparent px-2 py-1.5 text-sm " />
                <input aria-label="Cidade" value={end.cidade} onChange={(e) => setEnd({ ...end, cidade: e.target.value })} placeholder="Cidade" className="rounded-controle border border-borda-forte bg-transparent px-2 py-1.5 text-sm " />
              </div>
              <input aria-label="Complemento (apto, casa...)" value={end.complemento} onChange={(e) => setEnd({ ...end, complemento: e.target.value })} placeholder="Complemento (apto, casa...)" className="w-full rounded-controle border border-borda-forte bg-transparent px-2 py-1.5 text-sm " />
              <input aria-label="Ponto de referência" value={end.referencia} onChange={(e) => setEnd({ ...end, referencia: e.target.value })} placeholder="Ponto de referência" className="w-full rounded-controle border border-borda-forte bg-transparent px-2 py-1.5 text-sm " />
              <button type="button" onClick={calcularTaxa} disabled={calculando} className="w-full rounded-controle border border-emerald-500 py-1.5 text-sm font-semibold text-ok-texto disabled:opacity-50">{calculando ? "Calculando..." : <span className="inline-flex items-center justify-center gap-1.5"><Icone nome="local" tamanho={14} /> Calcular taxa pela distância</span>}</button>
              {calcMsg && (
                <p className={`text-xs ${geo?.fora ? "text-rose-600" : "text-texto-suave"}`}>
                  {calcMsg}
                  {geo && (
                    <>
                      {" · "}
                      <a href={`https://www.google.com/maps/search/?api=1&query=${geo.lat},${geo.lng}`} target="_blank" rel="noreferrer" className="font-semibold text-ok-texto hover:underline">conferir no mapa</a>
                    </>
                  )}
                </p>
              )}
            </div>
          )}

          {/* Itens */}
          <div>
            <div className="mb-1 text-xs font-semibold text-texto-suave">Itens</div>
            {/* Editando: o que já estava no pedido. Pra trocar o sabor da pizza, tire e monte de novo. */}
            {existentes.length > 0 && (
              <div className="mb-1.5 space-y-1.5">
                {existentes.map((l) => (
                  <div key={l.id} className={`flex items-start justify-between gap-2 rounded-controle border border-borda p-2 ${l.qtd === 0 ? "opacity-50" : ""}`}>
                    <div className="min-w-0 flex-1">
                      <div className={`whitespace-pre-line text-sm font-medium leading-tight ${l.qtd === 0 ? "line-through" : ""}`}>{l.descricao}</div>
                      <div className="text-xs text-ok-texto">{l.qtd === 0 ? "vai sair do pedido" : brl(l.preco * l.qtd)}</div>
                    </div>
                    {l.qtd === 0 ? (
                      <button onClick={() => setQtdExistente(l.id, 1)} className="text-xs font-semibold text-texto-marca hover:underline">Voltar</button>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => setQtdExistente(l.id, l.qtd - 1)} className="h-6 w-6 rounded border border-borda-forte">{l.qtd === 1 ? <Icone nome="lixeira" tamanho={13} titulo="Tirar do pedido" /> : "−"}</button>
                        <span className="w-4 text-center text-sm font-bold">{l.qtd}</span>
                        <button aria-label="Mais um" onClick={() => setQtdExistente(l.id, l.qtd + 1)} className="h-6 w-6 rounded border border-borda-forte text-ok-texto">+</button>
                      </div>
                    )}
                  </div>
                ))}
                <p className="text-xs text-texto-fraco">Pra trocar o sabor da pizza: tire a pizza (lixeira) e monte de novo em “Montar pizza”.</p>
              </div>
            )}
            {cart.length === 0 && existentes.length > 0 ? null : cart.length === 0 ? (
              <p className="rounded-controle border border-dashed border-borda-forte py-4 text-center text-sm text-texto-fraco">Toque nos produtos</p>
            ) : (
              <div className="space-y-1.5">
                {cart.map((l) => (
                  <div key={l.uid} className="flex items-start justify-between gap-2 rounded-controle border border-borda p-2">
                    <div className="min-w-0 flex-1">
                      {/* A observação aparece (e se edita) no campo de baixo, não no texto. */}
                      <div className="whitespace-pre-line text-sm font-medium leading-tight">{l.descricao.replace(/\nObs: [\s\S]*$/, "")}</div>
                      <div className="text-xs text-ok-texto">{brl(l.preco * l.qtd)}</div>
                      <input
                        aria-label={`Observação de ${l.descricao.split("\n")[0]}`}
                        value={l.payload.obs ?? ""}
                        onChange={(e) => setObsLinha(l.uid, e.target.value)}
                        maxLength={200}
                        placeholder="Observação deste item (ex.: sem cebola)"
                        className="campo mt-1.5 w-full text-xs"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => setQtd(l.uid, l.qtd - 1)} className="h-6 w-6 rounded border border-borda-forte">{l.qtd === 1 ? <Icone nome="lixeira" tamanho={13} titulo="Tirar do pedido" /> : "−"}</button>
                      <span className="w-4 text-center text-sm font-bold">{l.qtd}</span>
                      <button aria-label="Mais um" onClick={() => setQtd(l.uid, l.qtd + 1)} className="h-6 w-6 rounded border border-borda-forte text-ok-texto">+</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pagamento */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-semibold text-texto-suave">Forma</label>
              <select value={forma} onChange={(e) => setForma(e.target.value)} className="campo w-full px-2">
                {formasLista.map((f) => <option key={f.nome} value={f.nome}>{f.nome}</option>)}
              </select>
            </div>
            {!editar && (
              <div>
                <label className="text-xs font-semibold text-texto-suave">Origem</label>
                <select value={origem} onChange={(e) => setOrigem(e.target.value)} className="campo w-full px-2">
                  {ORIGENS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            )}
          </div>
          {editar?.pago && <p className="rounded-controle bg-destaque px-2 py-1.5 text-xs text-texto">Pedido já pago: dá pra trocar itens e endereço, mas o total não pode mudar.</p>}
          {forma === "Dinheiro" && (
            <input aria-label="Troco para quanto? (opcional)" value={trocoPara} onChange={(e) => setTrocoPara(e.target.value)} inputMode="decimal" placeholder="Troco para quanto? (opcional)" className="campo w-full" />
          )}
          {!editar && (
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-texto-suave"><Icone nome="agenda" tamanho={13} /> Agendar pra (opcional — vazio = pra agora)</label>
              <input type="datetime-local" value={agendar} onChange={(e) => setAgendar(e.target.value)} className="w-full rounded-controle border border-borda-forte bg-transparent px-3 py-2 text-sm " />
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            {tipo === "entrega" && (
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-texto-suave">Taxa entrega</label>
                  <button type="button" onClick={calcularTaxa} disabled={calculando} className="text-xs font-semibold text-ok-texto disabled:opacity-50">{calculando ? "..." : <span className="inline-flex items-center gap-1"><Icone nome="local" tamanho={12} /> calcular</span>}</button>
                </div>
                <input value={taxa} onChange={(e) => setTaxa(e.target.value)} inputMode="decimal" placeholder="0,00" className="campo w-full" />
              </div>
            )}
            <div>
              <label className="text-xs font-semibold text-texto-suave">Desconto</label>
              <input value={desconto} onChange={(e) => setDesconto(e.target.value)} inputMode="decimal" placeholder="0,00" className="campo w-full" />
            </div>
          </div>
          {descN > 0 && (
            <input aria-label="Motivo do desconto" value={descMotivo} onChange={(e) => setDescMotivo(e.target.value)} placeholder="Motivo do desconto" className="campo w-full" />
          )}
          <textarea aria-label="Observação (opcional)" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Observação (opcional)" rows={2} className="campo w-full" />
        </div>

        {/* Rodapé */}
        <div className="border-t border-borda p-3">
          <div className="mb-1 flex justify-between text-sm text-texto-suave"><span>Subtotal</span><span>{brl(subtotal)}</span></div>
          {tipo === "entrega" && <div className="mb-1 flex justify-between text-sm text-texto-suave"><span>Taxa</span><span>{brl(taxaN)}</span></div>}
          {descN > 0 && <div className="mb-1 flex justify-between text-sm text-rose-500"><span>Desconto</span><span>− {brl(descN)}</span></div>}
          <div className="mb-2 flex justify-between text-lg font-bold"><span>Total</span><span>{brl(total)}</span></div>
          {forma === "Dinheiro" && trocoN > total && <div className="mb-2 flex justify-between text-sm text-aviso-texto"><span>Troco</span><span>{brl(Math.round((trocoN - total) * 100) / 100)}</span></div>}
          {erro && <p role="alert" className="mb-2 text-sm text-urgente-texto">{erro}</p>}
          <button onClick={finalizar} disabled={proc} className="w-full rounded-cartao bg-texto py-3 text-base font-bold text-fundo disabled:opacity-50">{proc ? (editar ? "Salvando..." : "Criando...") : <span className="inline-flex items-center justify-center gap-2"><Icone nome="certo" tamanho={17} /> {editar ? "Salvar alterações" : "Criar pedido"}</span>}</button>
        </div>
      </div>

      {pzOpen && <PizzaModal comObs pizza={pizza} onClose={() => setPzOpen(false)} onAdd={(l) => { addLinha(l); setPzOpen(false); }} />}
      {comboItem && <ComboModal comObs item={comboItem} grupos={gruposDe(comboItem.id)} opcoesDe={opcoesDe} onClose={() => setComboItem(null)} onAdd={(l) => { addLinha(l); setComboItem(null); }} />}
    </div>
  );
}
