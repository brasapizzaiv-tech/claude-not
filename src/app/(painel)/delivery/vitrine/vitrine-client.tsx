"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icone } from "@/components/icone";
import { BotaoAcao } from "@/components/enviar";
import { avisar, confirmar } from "@/components/dialogo";
import { adicionarSugestao, removerDestaque, removerSugestao, salvarDestaque, salvarGatilho, type DestaqueForm } from "./actions";

// Vitrine do app — layout novo (out/2026). Aqui o Rafael troca o banner,
// a promoção, a vitrine de sugestões e os gatilhos de cupom sem chamar
// ninguém. Todo cupom que aparece no app sai do cadastro de Cupons: a tela
// nunca inventa desconto.

export type DadosVitrine = {
  numeros: { abriram: number; carrinho: number; ticket: number | null; pedidosApp: number; descontoCupom: number; pedidosComCupom: number };
  destaques: { id: string; titulo: string; subtitulo: string | null; item_id: string | null; pizza_tamanho_id: string | null; pizza_sabor_id: string | null; preco_de: number | null; preco_por: number | null; foto_url: string | null; selo: string | null; inicio: string | null; fim: string | null; ativo: boolean }[];
  sugestoes: { id: string; momento: "produto" | "carrinho"; categoria: string | null; item_id: string }[];
  gatilhos: { chave: string; ativo: boolean; cupom: string | null; minutos: number | null; validade_min: number | null }[];
  cupons: { codigo: string; tipo: "percent" | "valor"; valor: number; minimo: number | null; ativo: boolean }[];
  itens: { id: string; nome: string; categoria: string; preco: number }[];
  pizzaTamanhos: { id: string; nome: string }[];
  pizzaSabores: { id: string; nome: string }[];
  categorias: { valor: string; rotulo: string }[];
};

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataHoraBR = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(",", "");
const paraInput = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - 3 * 3600000).toISOString().slice(0, 16) : "");
const campo = "w-full min-h-11 rounded-controle border border-borda-forte bg-painel-cartao px-3 text-sm text-texto focus:border-primaria";
const descCupom = (c: { tipo: "percent" | "valor"; valor: number; minimo: number | null }) =>
  `${c.tipo === "percent" ? `${String(c.valor).replace(".", ",")}%` : brl(c.valor)} off${c.minimo != null ? ` acima de ${brl(c.minimo)}` : ""}`;

export function VitrineClient({ d }: { d: DadosVitrine }) {
  const router = useRouter();
  const [editando, setEditando] = useState<DestaqueForm | null>(null);
  const itemDe = new Map(d.itens.map((i) => [i.id, i]));
  const tamanhoDe = new Map(d.pizzaTamanhos.map((t) => [t.id, t.nome]));
  const saborDe = new Map(d.pizzaSabores.map((s) => [s.id, s.nome]));
  const agora = new Date().toISOString();
  const taxaCarrinho = d.numeros.abriram ? Math.round((d.numeros.carrinho / d.numeros.abriram) * 100) : null;

  async function executar(r: Promise<{ ok: boolean; mensagem?: string }>) {
    const x = await r;
    if (!x.ok) void avisar(x.mensagem ?? "Não deu certo.");
    else router.refresh();
    return x.ok;
  }

  const novoDestaque = (): DestaqueForm => ({ id: null, titulo: "", subtitulo: "", itemId: "", pizzaSaborId: "", selo: "", fotoUrl: "", precoDe: "", precoPor: "", inicio: "", fim: "", ativo: true });

  return (
    <div className="flex flex-col gap-4 px-4 py-5 md:px-[30px] md:py-[26px]">
      {/* ---------- topo ---------- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="rotulo">
            <Link href="/delivery" className="hover:text-texto">Delivery</Link>
          </p>
          <h1 className="mt-1 font-numero text-[30px] font-bold leading-[1.05] tracking-apertada text-texto">Vitrine do app</h1>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <a href="/pedir" target="_blank" rel="noopener" className="btn-secundario text-sm">Pré-visualizar no celular</a>
          <Link href="/delivery/cupons" className="btn-secundario text-sm">Cupons</Link>
        </div>
      </div>
      <p className="-mt-2 text-sm text-texto-suave">As mudanças valem na hora no app do cliente. Números dos últimos 7 dias.</p>

      {/* ---------- números ---------- */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="cartao px-5 py-4">
          <p className="rotulo">Abriram o app</p>
          <p className="numero-grande mt-2 text-[30px] text-texto">{d.numeros.abriram}</p>
          <p className="text-xs text-texto-suave">visitas (uma por pessoa por dia)</p>
        </div>
        <div className="cartao px-5 py-4">
          <p className="rotulo">Chegaram ao carrinho</p>
          <p className="numero-grande mt-2 text-[30px] text-texto">{d.numeros.carrinho}</p>
          <p className="text-xs text-texto-suave">{taxaCarrinho == null ? "—" : `${taxaCarrinho}% de quem abriu`}</p>
        </div>
        <div className="cartao px-5 py-4">
          <p className="rotulo">Ticket médio</p>
          <p className="numero-grande mt-2 text-[30px] text-texto">{d.numeros.ticket == null ? "—" : brl(d.numeros.ticket)}</p>
          <p className="text-xs text-texto-suave">{d.numeros.pedidosApp} pedidos pelo app</p>
        </div>
        <div className="cartao-foco px-5 py-4">
          <p className="rotulo !text-painel-foco-rotulo">Desconto dado em cupom</p>
          <p className="numero-grande mt-2 text-[30px]">{brl(d.numeros.descontoCupom)}</p>
          <p className="text-xs text-painel-foco-suave">em {d.numeros.pedidosComCupom} {d.numeros.pedidosComCupom === 1 ? "pedido" : "pedidos"}</p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="flex flex-col gap-4">
          {/* ---------- destaques ---------- */}
          <section className="cartao p-5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="font-numero text-[17px] font-bold text-texto">Destaques do topo</h2>
                <p className="text-xs text-texto-suave">O banner grande do começo do app, com o botão &quot;Pedir agora&quot;.</p>
              </div>
              <button type="button" onClick={() => setEditando(novoDestaque())} className="btn-secundario !min-h-11 text-sm">+ Novo</button>
            </div>
            <div className="mt-3 flex flex-col gap-2">
              {d.destaques.length === 0 && <p className="rounded-controle bg-painel-fundo px-3 py-4 text-center text-sm text-texto-suave">Nenhum destaque. Toque em + Novo pra criar o banner do app.</p>}
              {d.destaques.map((x) => {
                const item = x.item_id ? itemDe.get(x.item_id) : null;
                const agendado = x.ativo && x.inicio && x.inicio > agora;
                const vencido = x.fim && x.fim <= agora;
                const situacao = !x.ativo ? { t: "desligado", c: "pilula pilula-neutra" } : vencido ? { t: "encerrado", c: "pilula pilula-neutra" } : agendado ? { t: "agendado", c: "pilula" } : { t: "no ar", c: "pilula pilula-ok" };
                return (
                  <div key={x.id} className="flex items-center gap-3 rounded-controle bg-painel-fundo px-3 py-2.5">
                    <span className="h-11 w-14 shrink-0 rounded-mesa bg-[linear-gradient(135deg,color-mix(in_srgb,var(--marca-primaria)_55%,white),var(--marca-primaria))]" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-texto">{x.titulo}</p>
                      <p className="truncate text-xs text-texto-suave">
                        {item?.nome ?? (x.pizza_tamanho_id ? `Pizza ${tamanhoDe.get(x.pizza_tamanho_id) ?? ""}${x.pizza_sabor_id ? ` · ${saborDe.get(x.pizza_sabor_id) ?? ""}` : ""}` : "sem produto")}
                        {x.inicio ? ` · de ${dataHoraBR(x.inicio)}` : ""}{x.fim ? ` até ${dataHoraBR(x.fim)}` : ""}
                      </p>
                    </div>
                    <span className={situacao.c}>{situacao.t}</span>
                    <button
                      type="button"
                      onClick={() => setEditando({ id: x.id, titulo: x.titulo, subtitulo: x.subtitulo ?? "", itemId: x.item_id ?? (x.pizza_tamanho_id ? `pz:${x.pizza_tamanho_id}` : ""), pizzaSaborId: x.pizza_sabor_id ?? "", selo: x.selo ?? "", fotoUrl: x.foto_url ?? "", precoDe: x.preco_de != null ? String(x.preco_de).replace(".", ",") : "", precoPor: x.preco_por != null ? String(x.preco_por).replace(".", ",") : "", inicio: paraInput(x.inicio), fim: paraInput(x.fim), ativo: x.ativo })}
                      aria-label={`Editar ${x.titulo}`}
                      className="flex h-11 w-11 items-center justify-center rounded-controle text-texto-suave hover:bg-superficie-suave"
                    >
                      <Icone nome="editar" tamanho={16} />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ---------- sugestões ---------- */}
          <Sugestoes d={d} itemDe={itemDe} executar={executar} />
        </div>

        {/* ---------- gatilhos ---------- */}
        <section className="cartao flex flex-col gap-3 p-5">
          <div>
            <h2 className="font-numero text-[17px] font-bold text-texto">Gatilhos de cupom</h2>
            <p className="text-xs text-texto-suave">No máximo um cupom por cliente por dia. O valor é conferido no servidor ao fechar o pedido.</p>
          </div>
          <Gatilho
            chave="boas_vindas" titulo="Boas-vindas" explica="Primeira visita, nunca pediu: o cupom aparece assim que o app abre."
            d={d} executar={executar}
          />
          <Gatilho
            chave="parado" titulo="Ficou parado sem escolher" explica="Abriu o app e ficou sem pôr nada no carrinho: aparece o cupom, que vale por alguns minutos."
            d={d} executar={executar} comMinutos="depois de" comValidade
          />
          <Gatilho
            chave="abandonado" titulo="Carrinho abandonado" explica="Montou o carrinho e saiu sem pedir: quando volta, o cupom aparece no app. Quem deixou o telefone e aceita promoções também recebe no WhatsApp."
            d={d} executar={executar} comMinutos="esperar"
          >
            <Link href="/delivery/gatilhos" className="text-xs font-semibold text-texto-marca hover:underline">Configurar a mensagem do WhatsApp (gatilho &quot;Carrinho abandonado&quot;)</Link>
          </Gatilho>
          <div className="rounded-controle bg-painel-fundo px-4 py-3 text-xs text-texto-suave">
            <p className="font-semibold text-texto">Regras que valem para os três</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              <li>Nunca aparece com produto em promoção no carrinho nem com outro cupom já aplicado.</li>
              <li>Nunca aparece pra quem já está fechando o pedido (no carrinho).</li>
              <li>O cupom só sai se estiver cadastrado e ativo em Cupons.</li>
            </ul>
          </div>
        </section>
      </div>

      {editando && (
        <FormDestaque
          inicial={editando}
          itens={d.itens}
          pizzaTamanhos={d.pizzaTamanhos}
          pizzaSabores={d.pizzaSabores}
          onFechar={() => setEditando(null)}
          onSalvar={async (f) => { if (await executar(salvarDestaque(f))) setEditando(null); }}
          onRemover={editando.id ? async () => {
            if (!(await confirmar("Apagar este destaque?", { perigo: true, okTexto: "Apagar" }))) return;
            if (await executar(removerDestaque(editando.id!))) setEditando(null);
          } : undefined}
        />
      )}
    </div>
  );
}

function Sugestoes({ d, itemDe, executar }: {
  d: DadosVitrine;
  itemDe: Map<string, DadosVitrine["itens"][number]>;
  executar: (r: Promise<{ ok: boolean; mensagem?: string }>) => Promise<boolean>;
}) {
  const [quando, setQuando] = useState(d.categorias[0]?.valor ?? "");
  const grupos = [
    ...d.categorias.filter((c) => d.sugestoes.some((s) => s.momento === "produto" && s.categoria === c.valor) || c.valor === quando)
      .map((c) => ({ chave: `p:${c.valor}`, rotulo: c.rotulo, momento: "produto" as const, categoria: c.valor })),
    { chave: "carrinho", rotulo: "No carrinho (“pra fechar com chave de ouro”)", momento: "carrinho" as const, categoria: null },
  ];
  return (
    <section className="cartao p-5">
      <h2 className="font-numero text-[17px] font-bold text-texto">Sugestões &quot;Quer adicionar?&quot;</h2>
      <p className="text-xs text-texto-suave">Cruze o que aparece junto de cada produto e no carrinho.</p>
      <label className="mt-3 flex items-center gap-2 text-sm text-texto-suave">
        Mostrar também
        <select value={quando} onChange={(e) => setQuando(e.target.value)} className="min-h-11 flex-1 rounded-controle border border-borda-forte bg-painel-cartao px-2 text-sm text-texto">
          {d.categorias.map((c) => <option key={c.valor} value={c.valor}>{c.rotulo}</option>)}
        </select>
      </label>
      <div className="mt-3 flex flex-col gap-4">
        {grupos.map((g) => {
          const lista = d.sugestoes.filter((s) => s.momento === g.momento && (g.momento === "carrinho" || s.categoria === g.categoria));
          const usados = new Set(lista.map((s) => s.item_id));
          return (
            <div key={g.chave}>
              <p className="rotulo mb-1.5">{g.rotulo}</p>
              <div className="flex flex-wrap items-center gap-1.5">
                {lista.map((s) => (
                  <span key={s.id} className="pilula !pr-1">
                    {itemDe.get(s.item_id)?.nome ?? "produto removido"}
                    <BotaoAcao aoClicar={() => executar(removerSugestao(s.id))} aria-label="Tirar" className="ml-0.5 flex h-6 w-6 items-center justify-center rounded-full hover:bg-painel-cartao/60">
                      <Icone nome="fechar" tamanho={12} />
                    </BotaoAcao>
                  </span>
                ))}
                <select
                  value=""
                  onChange={(e) => { if (e.target.value) void executar(adicionarSugestao(g.momento, g.categoria, e.target.value)); }}
                  aria-label={`Adicionar sugestão — ${g.rotulo}`}
                  className="min-h-9 rounded-full border border-dashed border-borda-forte bg-transparent px-3 text-xs text-texto-suave"
                >
                  <option value="">+ item</option>
                  {d.itens.filter((i) => !usados.has(i.id)).map((i) => <option key={i.id} value={i.id}>{i.nome} · {brl(i.preco)}</option>)}
                </select>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Gatilho({ chave, titulo, explica, d, executar, comMinutos, comValidade, children }: {
  chave: "boas_vindas" | "parado" | "abandonado";
  titulo: string;
  explica: string;
  d: DadosVitrine;
  executar: (r: Promise<{ ok: boolean; mensagem?: string }>) => Promise<boolean>;
  comMinutos?: string;
  comValidade?: boolean;
  children?: React.ReactNode;
}) {
  const g = d.gatilhos.find((x) => x.chave === chave);
  const [cupom, setCupom] = useState(g?.cupom ?? "");
  const [minutos, setMinutos] = useState(String(g?.minutos ?? (chave === "parado" ? 2 : 20)));
  const [validade, setValidade] = useState(String(g?.validade_min ?? 15));
  const ativo = !!g?.ativo;
  const salvar = (novoAtivo: boolean) =>
    executar(salvarGatilho(chave, { ativo: novoAtivo, cupom: cupom || null, minutos: Number(minutos) || null, validadeMin: Number(validade) || null }));
  const cupomInfo = d.cupons.find((c) => c.codigo === cupom);

  return (
    <div className={`rounded-controle p-4 ${ativo ? "bg-destaque" : "bg-painel-fundo"}`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-texto">{titulo}</p>
          <p className="text-xs text-texto-suave">{explica}</p>
        </div>
        <BotaoAcao
          aoClicar={() => salvar(!ativo)}
          aria-label={ativo ? `Desligar ${titulo}` : `Ligar ${titulo}`}
          className={`relative h-7 w-12 shrink-0 rounded-full transition ${ativo ? "bg-primaria" : "bg-borda-forte"}`}
        >
          <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${ativo ? "left-6" : "left-1"}`} />
        </BotaoAcao>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-texto-suave">
        {comMinutos && (
          <>
            <span>{comMinutos}</span>
            <input value={minutos} onChange={(e) => setMinutos(e.target.value.replace(/\D/g, "").slice(0, 3))} onBlur={() => void salvar(ativo)} inputMode="numeric" aria-label="Minutos" className="h-9 w-14 rounded-mesa border border-borda-forte bg-painel-cartao text-center font-numero text-sm text-texto" />
            <span>min{chave === "parado" ? " sem nada no carrinho" : ""}</span>
          </>
        )}
        <span>cupom</span>
        <select value={cupom} onChange={(e) => setCupom(e.target.value)} onBlur={() => void salvar(ativo)} aria-label="Cupom" className="h-9 rounded-mesa border border-borda-forte bg-painel-cartao px-2 font-numero text-sm text-texto">
          <option value="">— escolher —</option>
          {d.cupons.filter((c) => c.ativo || c.codigo === cupom).map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo}</option>)}
        </select>
        {comValidade && (
          <>
            <span>vale</span>
            <input value={validade} onChange={(e) => setValidade(e.target.value.replace(/\D/g, "").slice(0, 3))} onBlur={() => void salvar(ativo)} inputMode="numeric" aria-label="Minutos de validade" className="h-9 w-14 rounded-mesa border border-borda-forte bg-painel-cartao text-center font-numero text-sm text-texto" />
            <span>min</span>
          </>
        )}
        {cupomInfo && <span className="pilula pilula-neutra">{descCupom(cupomInfo)}</span>}
      </div>
      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}

function FormDestaque({ inicial, itens, pizzaTamanhos, pizzaSabores, onFechar, onSalvar, onRemover }: {
  inicial: DestaqueForm;
  itens: DadosVitrine["itens"];
  pizzaTamanhos: DadosVitrine["pizzaTamanhos"];
  pizzaSabores: DadosVitrine["pizzaSabores"];
  onFechar: () => void;
  onSalvar: (f: DestaqueForm) => Promise<void>;
  onRemover?: () => Promise<void>;
}) {
  const [f, setF] = useState(inicial);
  const set = (k: keyof DestaqueForm, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <div className="cartao my-6 w-full max-w-lg p-5" role="dialog" aria-label={inicial.id ? "Editar destaque" : "Novo destaque"}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-numero text-lg font-bold text-texto">{inicial.id ? "Editar destaque" : "Novo destaque"}</h2>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="flex h-11 w-11 items-center justify-center text-texto-fraco"><Icone nome="fechar" tamanho={18} /></button>
        </div>
        <div className="flex flex-col gap-3">
          <label className="text-xs text-texto-suave">Título (aparece grande)
            <input value={f.titulo} onChange={(e) => set("titulo", e.target.value)} placeholder="Pizza grande + refri 2 L" className={`${campo} mt-1`} />
          </label>
          <label className="text-xs text-texto-suave">Frase de apoio
            <input value={f.subtitulo} onChange={(e) => set("subtitulo", e.target.value)} placeholder="Qualquer sabor da casa, entrega em até 40 min" className={`${campo} mt-1`} />
          </label>
          <label className="text-xs text-texto-suave">Produto do botão &quot;Pedir agora&quot;
            <select value={f.itemId} onChange={(e) => set("itemId", e.target.value)} className={`${campo} mt-1`}>
              <option value="">— escolher —</option>
              {pizzaTamanhos.length > 0 && (
                <optgroup label="Pizza (abre o montador)">
                  {pizzaTamanhos.map((t) => <option key={t.id} value={`pz:${t.id}`}>Pizza {t.nome}</option>)}
                </optgroup>
              )}
              <optgroup label="Produtos">
                {itens.map((i) => <option key={i.id} value={i.id}>{i.nome} · {i.categoria}</option>)}
              </optgroup>
            </select>
          </label>
          {f.itemId.startsWith("pz:") && (
            <label className="text-xs text-texto-suave">Sabor já marcado (opcional)
              <select value={f.pizzaSaborId ?? ""} onChange={(e) => set("pizzaSaborId", e.target.value)} className={`${campo} mt-1`}>
                <option value="">Qualquer sabor (o cliente escolhe)</option>
                {pizzaSabores.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
            </label>
          )}
          <label className="text-xs text-texto-suave">Selo (opcional)
            <input value={f.selo} onChange={(e) => set("selo", e.target.value)} placeholder="Só hoje" className={`${campo} mt-1`} />
          </label>
          <p className="-mt-1 text-xs text-texto-fraco">O preço do banner é o do produto no cardápio (com a promoção dele, se tiver) — o mesmo que o carrinho cobra.</p>
          <label className="text-xs text-texto-suave">Foto (link da imagem, opcional — sem foto usa a do produto)
            <input value={f.fotoUrl} onChange={(e) => set("fotoUrl", e.target.value)} placeholder="https://…" className={`${campo} mt-1`} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-texto-suave">Começa (vazio = já)
              <input type="datetime-local" value={f.inicio} onChange={(e) => set("inicio", e.target.value)} className={`${campo} mt-1`} />
            </label>
            <label className="text-xs text-texto-suave">Termina (vazio = sem fim)
              <input type="datetime-local" value={f.fim} onChange={(e) => set("fim", e.target.value)} className={`${campo} mt-1`} />
            </label>
          </div>
          <label className="flex min-h-11 items-center gap-2 text-sm text-texto">
            <input type="checkbox" checked={f.ativo} onChange={(e) => set("ativo", e.target.checked)} className="h-5 w-5" /> Ligado
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <BotaoAcao aoClicar={() => onSalvar(f)} className="btn-principal flex-1 text-sm">Salvar destaque</BotaoAcao>
          {onRemover && <BotaoAcao aoClicar={onRemover} className="btn-secundario text-sm !text-urgente-texto">Apagar</BotaoAcao>}
        </div>
      </div>
    </div>
  );
}
