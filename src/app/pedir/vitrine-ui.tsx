"use client";

// Peças da Vitrine no app do cliente (/pedir): banner de destaques, folha
// "Quer adicionar?", fila "Pra fechar com chave de ouro" e o cartão do cupom
// dos gatilhos. Desenho do layout novo (out/2026), tudo por token.
import { useEffect, useState } from "react";
import { Icone } from "@/components/icone";
import { brl, type Item, type PizzaData } from "@/components/delivery-pedido-ui";
import type { CupomVitrine, VitrineApp } from "@/lib/vitrine";

export const textoCupom = (c: CupomVitrine) =>
  c.tipo === "percent" ? `${String(c.valor).replace(".", ",")}% off` : `${brl(c.valor)} off`;

function Foto({ url, className }: { url: string | null | undefined; className: string }) {
  if (!url) {
    return (
      <div className={`${className} flex items-center justify-center bg-[linear-gradient(135deg,color-mix(in_srgb,var(--marca-primaria)_55%,white),var(--marca-primaria))]`}>
        <Icone nome="pizza" tamanho={30} className="text-marca-escuro/70" />
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className={`${className} object-cover`} />;
}

/** Destaques do topo: um cartão grande por destaque, com "Pedir agora". */
export function DestaquesTopo({ destaques, itemDe, onPedir, pizza, onPizza }: {
  destaques: VitrineApp["destaques"];
  itemDe: Map<string, Item>;
  onPedir: (i: Item) => void;
  /** Destaque de pizza (migration 0246): abre o montador no tamanho/sabor. */
  pizza?: PizzaData;
  onPizza?: (tamanhoId: string, saborId: string | null) => void;
}) {
  if (destaques.length === 0) return null;
  return (
    <div className="flex snap-x gap-3 overflow-x-auto px-3 pb-1 pt-3" aria-label="Destaques">
      {destaques.map((d) => {
        const item = d.itemId ? itemDe.get(d.itemId) : undefined;
        const tam = d.pizzaTamanhoId && pizza ? pizza.tamanhos.find((t) => t.id === d.pizzaTamanhoId) : undefined;
        const sabor = tam && d.pizzaSaborId ? pizza?.sabores.find((s) => s.id === d.pizzaSaborId) : undefined;
        // Pizza: preço do sabor nesse tamanho; sem sabor, "a partir de" o mais barato.
        const precosPizza = tam
          ? (pizza?.saborPrecos ?? [])
              .filter((p) => p.tamanho_id === tam.id && (sabor ? p.sabor_id === sabor.id : pizza?.sabores.some((s) => s.id === p.sabor_id)))
              .map((p) => Number(p.preco)).filter((v) => v > 0)
          : [];
        const aPartir = !!tam && !sabor;
        // Sempre o preço do cardápio: é o que o carrinho cobra.
        const por = item?.preco ?? (precosPizza.length ? Math.min(...precosPizza) : null);
        const de = item?.preco_antigo ?? null;
        return (
          <div key={d.id} className="cartao w-[88%] max-w-sm shrink-0 snap-start overflow-hidden">
            <div className="relative">
              <Foto url={d.foto ?? item?.foto_url ?? sabor?.foto_url} className="h-36 w-full" />
              {d.selo && <span className="pilula pilula-grafite absolute left-3 top-3">{d.selo}</span>}
            </div>
            <div className="p-4">
              <p className="font-numero text-lg font-bold leading-tight tracking-apertada text-texto">{d.titulo}</p>
              {d.subtitulo && <p className="mt-0.5 text-sm text-texto-suave">{d.subtitulo}</p>}
              <div className="mt-3 flex items-center justify-between gap-3">
                {item ? (
                  <button type="button" onClick={() => onPedir(item)} className="btn-principal flex-1 text-sm">Pedir agora</button>
                ) : tam && onPizza ? (
                  <button type="button" onClick={() => onPizza(tam.id, sabor?.id ?? null)} className="btn-principal flex-1 text-sm">Pedir agora</button>
                ) : <span />}
                {por != null && por > 0 && (
                  <span className="text-right">
                    {de != null && de > por && <span className="block text-xs text-texto-fraco line-through">{brl(de)}</span>}
                    {aPartir && <span className="block text-xs text-texto-suave">a partir de</span>}
                    <span className="font-numero text-lg font-bold text-texto-marca">{brl(por)}</span>
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Linha de produto pequena com o botão de adicionar. */
function ItemSugerido({ i, onAdd }: { i: Item; onAdd: (i: Item) => void }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <Foto url={i.foto_url} className="h-12 w-12 shrink-0 rounded-mesa" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-texto">{i.nome}</p>
        <p className="text-xs text-texto-suave">+ {brl(i.preco)}</p>
      </div>
      <button type="button" onClick={() => onAdd(i)} aria-label={`Adicionar ${i.nome}`} className="flex h-11 w-11 items-center justify-center rounded-controle bg-destaque text-xl font-bold text-texto-marca-pilula">+</button>
    </div>
  );
}

/** Folha "Quer adicionar?", logo depois de escolher um produto. */
export function SheetQuerAdicionar({ itens, onAdd, onFechar }: { itens: Item[]; onAdd: (i: Item) => void; onFechar: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40" onClick={onFechar}>
      <div className="w-full max-w-lg rounded-t-[24px] bg-painel-cartao p-5 pb-7" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Quer adicionar?">
        <div className="mb-1 flex items-center justify-between">
          <p className="font-numero text-lg font-bold text-texto">Quer adicionar?</p>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="flex h-11 w-11 items-center justify-center text-texto-fraco"><Icone nome="fechar" tamanho={18} /></button>
        </div>
        <p className="mb-2 text-sm text-texto-suave">Combina com o que você escolheu.</p>
        <div className="divide-y divide-borda">
          {itens.map((i) => <ItemSugerido key={i.id} i={i} onAdd={onAdd} />)}
        </div>
        <button type="button" onClick={onFechar} className="btn-secundario mt-4 w-full text-sm">Não, obrigado</button>
      </div>
    </div>
  );
}

/** Fila "Pra fechar com chave de ouro", no carrinho. */
export function ChaveDeOuro({ itens, onAdd }: { itens: Item[]; onAdd: (i: Item) => void }) {
  if (itens.length === 0) return null;
  return (
    <div className="mb-4">
      <p className="mb-2 font-numero font-bold text-texto">Pra fechar com chave de ouro</p>
      <div className="flex gap-2.5 overflow-x-auto pb-1">
        {itens.map((i) => (
          <div key={i.id} className="cartao w-32 shrink-0 overflow-hidden">
            <Foto url={i.foto_url} className="h-20 w-full" />
            <div className="p-2.5">
              <p className="line-clamp-2 text-xs font-semibold leading-tight text-texto">{i.nome}</p>
              <div className="mt-1.5 flex items-center justify-between">
                <span className="font-numero text-sm font-bold text-texto">{brl(i.preco)}</span>
                <button type="button" onClick={() => onAdd(i)} aria-label={`Adicionar ${i.nome}`} className="flex h-8 w-8 items-center justify-center rounded-mesa bg-primaria font-bold text-marca-sobre-primaria">+</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Contagem({ ate }: { ate: number }) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.round((ate - agora) / 1000));
  return (
    <span className="inline-flex items-center gap-1 font-numero text-sm font-bold text-painel-foco-rotulo" aria-label={`Vale por mais ${Math.ceil(s / 60)} minutos`}>
      <Icone nome="relogio" tamanho={15} /> {String(Math.floor(s / 60)).padStart(2, "0")}:{String(s % 60).padStart(2, "0")}
    </span>
  );
}

/** Cartão do cupom de um gatilho (boas-vindas, parado ou carrinho abandonado). */
export function CupomGatilho({ cupom, rotulo, titulo, texto, ate, botao, onAplicar, onFechar }: {
  cupom: CupomVitrine;
  rotulo: string;
  titulo: string;
  texto: string;
  ate?: number | null;
  botao: string;
  onAplicar: () => void;
  onFechar: () => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center p-3">
      <div className="cartao-foco w-full max-w-lg p-5" role="dialog" aria-label={titulo} style={{ "--foco": "var(--painel-foco-texto)" } as React.CSSProperties}>
        <div className="flex items-start justify-between gap-2">
          <span className="rotulo !text-painel-foco-rotulo">{rotulo}</span>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="-mr-2 -mt-2 flex h-11 w-11 items-center justify-center text-painel-foco-suave"><Icone nome="fechar" tamanho={18} /></button>
        </div>
        <p className="numero-grande -mt-1 text-[26px]">{titulo}</p>
        <p className="mt-1 text-sm text-painel-foco-suave">{texto}</p>
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="rounded-controle border border-dashed border-painel-foco-linha px-4 py-2 font-numero text-base font-bold tracking-wider">{cupom.codigo}</span>
          {ate ? <Contagem ate={ate} /> : null}
        </div>
        <button type="button" onClick={onAplicar} className="btn-principal mt-4 w-full text-sm">{botao}</button>
      </div>
    </div>
  );
}
