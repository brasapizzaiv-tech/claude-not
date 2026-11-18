"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BotaoAcao, Enviar } from "@/components/enviar";
import { confirmar, avisar } from "@/components/dialogo";
import { Icone } from "@/components/icone";
import { UNIDADES, type Ficha } from "@/lib/fichas";
import {
  adicionarItem, buscarFichas, buscarPratos, buscarProdutos, excluirFicha, ligarItem, ligarPrato, salvarFicha, salvarItem, tirarItem,
} from "../actions";

export type LinhaItem = {
  id: string; descricao: string; quantidade: number; unidade: string;
  conversao: number | null; conversaoUsada: number | null;
  produto: { id: string; nome: string; unidade: string; preco: number | null } | null;
  subFicha: { id: string; nome: string; custoKg: number | null } | null;
  custo: number | null; fonte: "produto" | "planilha" | "ficha" | null; problema: string | null; precoPlanilha: number | null;
};

const brl = (n: number | null | undefined, casas = 2) => (n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: casas, maximumFractionDigits: casas }));
const numBR = (n: number | null | undefined) => (n == null ? "" : String(n).replace(".", ","));

export function EditorFicha({
  ficha, linhas, total, custoKg, pendencias, usaPlanilha, usadaEm, pratos, categorias,
}: {
  ficha: Ficha; linhas: LinhaItem[]; total: number | null; custoKg: number | null; pendencias: number; usaPlanilha: number;
  usadaEm: { id: string; nome: string }[]; pratos: { id: string; nome: string }[]; categorias: string[];
}) {
  const router = useRouter();
  const [ligando, setLigando] = useState<string | null>(null);
  const antes = ficha.custo_kg_planilha;
  const dif = custoKg != null && antes ? (custoKg / antes - 1) * 100 : null;

  const [msgDados, salvarDados] = useActionState(async (_: string | null, fd: FormData) => {
    const r = await salvarFicha(ficha.id, fd);
    if (r.ok) router.refresh();
    return r.ok ? "✓ Salvo." : r.erro;
  }, null);
  const [msgNovo, adicionar] = useActionState(async (_: string | null, fd: FormData) => {
    const r = await adicionarItem(ficha.id, fd);
    if (r.ok) router.refresh();
    return r.ok ? null : r.erro;
  }, null);
  const formNovo = useRef<HTMLFormElement>(null);

  async function rodar(p: Promise<{ ok: boolean; erro?: string }>) {
    const r = await p;
    if (!r.ok) void avisar("Não deu certo", r.erro);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        {/* Dados da ficha */}
        <form action={salvarDados} className="cartao space-y-3 p-5">
          <h1 className="titulo-pagina">{ficha.nome}</h1>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="rotulo">Nome</span>
              <input name="nome" defaultValue={ficha.nome} required minLength={2} className="campo mt-1 w-full" /></label>
            <label className="block"><span className="rotulo">Categoria</span>
              <input name="categoria" defaultValue={ficha.categoria ?? ""} list="fichas-categorias" className="campo mt-1 w-full" />
              <datalist id="fichas-categorias">{categorias.map((c) => <option key={c} value={c} />)}</datalist></label>
            <label className="block"><span className="rotulo">Rende (kg pronto)</span>
              <input name="rendimento_kg" inputMode="decimal" defaultValue={numBR(ficha.rendimento_kg)} placeholder="ex.: 2,5" className="campo mt-1 w-full text-right" /></label>
            <label className="block"><span className="rotulo">Rende o quê</span>
              <input name="rendimento_texto" defaultValue={ficha.rendimento_texto ?? ""} placeholder="1 forma, porção…" className="campo mt-1 w-full" /></label>
          </div>
          <label className="flex min-h-11 items-center gap-2 text-sm text-texto">
            <input type="checkbox" name="base" defaultChecked={ficha.base} /> Usada dentro de outras fichas (molho, massa, base)
          </label>
          <label className="block"><span className="rotulo">Observações (modo de fazer, dicas)</span>
            <textarea name="obs" defaultValue={ficha.obs ?? ""} rows={3} className="campo mt-1 w-full" /></label>
          <div className="flex flex-wrap items-center gap-3">
            <Enviar className="btn-principal px-5">Salvar</Enviar>
            {msgDados && <p role="status" className="text-sm text-texto-suave">{msgDados}</p>}
          </div>
        </form>

        {/* Custo */}
        <div className="space-y-4">
          <div className="cartao-foco p-5">
            <span className="rotulo text-painel-foco-rotulo">Custo por kg hoje</span>
            <p className="numero-grande mt-1 text-4xl">{brl(custoKg)}</p>
            <p className="mt-1 text-sm">
              Total {brl(total)}{ficha.rendimento_kg ? ` · rende ${numBR(ficha.rendimento_kg)} kg` : " · falta o rendimento"}
              {ficha.rendimento_texto ? ` (${ficha.rendimento_texto})` : ""}
            </p>
            {antes != null && (
              <p className="mt-2 text-sm">
                Em 2025: {brl(antes)}/kg{dif != null && <> · <b>{dif > 0 ? "+" : ""}{dif.toFixed(0)}%</b></>}
              </p>
            )}
          </div>
          {(pendencias > 0 || usaPlanilha > 0) && (
            <div className="cartao border-l-4 border-urgente-texto p-4 text-sm">
              {pendencias > 0 && <p className="font-semibold text-urgente-texto">{pendencias} ingrediente(s) pra acertar</p>}
              {usaPlanilha > 0 && <p className="mt-1 text-texto-suave">{usaPlanilha} ainda com o preço da planilha de 2025. Ligue ao produto do estoque pra acompanhar as notas.</p>}
            </div>
          )}
          <PratosLigados fichaId={ficha.id} pratos={pratos} rodar={rodar} />
          {usadaEm.length > 0 && (
            <div className="cartao p-4 text-sm">
              <p className="rotulo">Usada dentro de</p>
              <ul className="mt-1 space-y-1">{usadaEm.map((u) => <li key={u.id}><Link href={`/fichas-tecnicas/${u.id}`} className="text-texto-marca hover:underline">{u.nome}</Link></li>)}</ul>
            </div>
          )}
        </div>
      </div>

      {/* Ingredientes */}
      <div className="cartao overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left">
              <th className="rotulo px-4 py-3">Ingrediente</th>
              <th className="rotulo px-4 py-3">Vem de</th>
              <th className="rotulo px-4 py-3 text-right">Quantidade</th>
              <th className="rotulo px-4 py-3 text-right">Custo</th>
              <th className="px-2 py-3"><span className="sr-only">Tirar</span></th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <LinhaIngrediente key={`${l.id}|${l.quantidade}|${l.unidade}|${l.conversao}|${l.conversaoUsada}`} l={l} fichaId={ficha.id} aberto={ligando === l.id} abrir={() => setLigando(ligando === l.id ? null : l.id)} fechar={() => setLigando(null)} rodar={rodar} />
            ))}
            {linhas.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-texto-suave">Nenhum ingrediente ainda. Adicione no formulário aqui embaixo.</td></tr>}
          </tbody>
        </table>
        <form ref={formNovo} action={async (fd) => { await adicionar(fd); formNovo.current?.reset(); }} className="flex flex-wrap items-end gap-2 border-t border-borda p-4">
          <label className="block"><span className="rotulo">Novo ingrediente</span>
            <input name="descricao" required placeholder="ex.: Nata" className="campo mt-1 w-56" /></label>
          <label className="block"><span className="rotulo">Quantidade</span>
            <input name="quantidade" inputMode="decimal" placeholder="0,5" className="campo mt-1 w-28 text-right" /></label>
          <label className="block"><span className="rotulo">Unidade</span>
            <select name="unidade" defaultValue="kg" className="campo mt-1 w-24">{UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}</select></label>
          <Enviar className="btn-secundario px-4"><Icone nome="novo" tamanho={16} /> Adicionar</Enviar>
          {msgNovo && <p role="alert" className="text-sm text-urgente-texto">{msgNovo}</p>}
        </form>
      </div>

      <div className="flex justify-end">
        <BotaoAcao
          aoClicar={async () => {
            if (!(await confirmar(`Excluir a ficha “${ficha.nome}”?`, { detalhe: "Some de vez, com os ingredientes. Não dá para desfazer.", perigo: true, okTexto: "Excluir a ficha" }))) return;
            const r = await excluirFicha(ficha.id);
            if (r && !r.ok) void avisar("Não excluí", r.erro);
          }}
          className="btn-secundario px-4 text-urgente-texto"
        >
          <Icone nome="lixeira" tamanho={16} /> Excluir ficha
        </BotaoAcao>
      </div>
    </div>
  );
}

function LinhaIngrediente({ l, fichaId, aberto, abrir, fechar, rodar }: {
  l: LinhaItem; fichaId: string; aberto: boolean; abrir: () => void; fechar: () => void; rodar: (p: Promise<{ ok: boolean; erro?: string }>) => Promise<void>;
}) {
  const [qtd, setQtd] = useState(numBR(l.quantidade));
  const [conv, setConv] = useState(numBR(l.conversao ?? l.conversaoUsada));
  // (a linha é recriada quando o valor salvo muda: a chave dela inclui quantidade e conversão)
  const pedeConversao = !!l.produto && (l.conversao != null || l.conversaoUsada == null || l.conversaoUsada !== 1);

  return (
    <>
      <tr className={`border-t border-borda ${l.problema ? "bg-destaque/40" : ""}`}>
        <td className="px-4 py-2.5">
          <p className="font-semibold text-texto">{l.descricao}</p>
          {l.problema && <p className="text-xs text-urgente-texto">{l.problema}</p>}
        </td>
        <td className="px-4 py-2.5">
          {l.produto ? (
            <p className="text-texto">{l.produto.nome} <span className="text-xs text-texto-fraco">· {brl(l.produto.preco, 2)}/{l.produto.unidade}</span></p>
          ) : l.subFicha ? (
            <p className="text-texto">Ficha: <Link href={`/fichas-tecnicas/${l.subFicha.id}`} className="text-texto-marca hover:underline">{l.subFicha.nome}</Link> <span className="text-xs text-texto-fraco">· {brl(l.subFicha.custoKg)}/kg</span></p>
          ) : (
            <p className="text-texto-fraco">não ligado</p>
          )}
          {pedeConversao && l.produto && (
            <label className="mt-1 flex items-center gap-1 text-xs text-texto-suave">
              1 {l.produto.unidade} =
              <input value={conv} onChange={(e) => setConv(e.target.value)} inputMode="decimal" aria-label="Conversão"
                onBlur={() => { if (conv !== numBR(l.conversao ?? l.conversaoUsada)) void rodar(salvarItem(fichaId, l.id, { conversao: conv })); }}
                className="campo h-9 w-20 px-2 text-right text-xs" /> {l.unidade}
              <span className="text-texto-fraco">(vale pra todas as fichas com esse produto)</span>
            </label>
          )}
          <button type="button" onClick={abrir} className="mt-1 min-h-9 text-xs font-semibold text-texto-marca hover:underline">
            {l.produto || l.subFicha ? "Trocar" : "Ligar a um produto ou ficha"}
          </button>
        </td>
        <td className="px-4 py-2.5 text-right">
          <div className="flex items-center justify-end gap-1">
            <input value={qtd} onChange={(e) => setQtd(e.target.value)} inputMode="decimal" aria-label={`Quantidade de ${l.descricao}`}
              onBlur={() => { if (qtd !== numBR(l.quantidade)) void rodar(salvarItem(fichaId, l.id, { quantidade: qtd })); }}
              className="campo h-10 w-24 text-right font-numero" />
            <select value={l.unidade} aria-label="Unidade" onChange={(e) => void rodar(salvarItem(fichaId, l.id, { unidade: e.target.value }))} className="campo h-10 w-20">
              {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </td>
        <td className="font-numero px-4 py-2.5 text-right">
          <span className="font-semibold text-texto">{brl(l.custo)}</span>
          {l.fonte === "planilha" && <p className="text-xs text-texto-fraco">preço de 2025</p>}
        </td>
        <td className="px-2 py-2.5 text-right">
          <BotaoAcao aria-label={`Tirar ${l.descricao}`} className="h-11 w-11 rounded-controle text-lg text-urgente-texto"
            aoClicar={async () => { if (await confirmar(`Tirar “${l.descricao}” desta ficha?`, { okTexto: "Tirar" })) await rodar(tirarItem(fichaId, l.id)); }}>
            ✕
          </BotaoAcao>
        </td>
      </tr>
      {aberto && (
        <tr className="border-t border-borda bg-superficie-suave">
          <td colSpan={5} className="px-4 py-3">
            <Ligador fichaId={fichaId} itemId={l.id} sugestao={l.descricao} fechar={fechar} rodar={rodar} />
          </td>
        </tr>
      )}
    </>
  );
}

/** Busca produto do estoque ou outra ficha (sempre no banco) e liga ao ingrediente. */
function Ligador({ fichaId, itemId, sugestao, fechar, rodar }: { fichaId: string; itemId: string; sugestao: string; fechar: () => void; rodar: (p: Promise<{ ok: boolean; erro?: string }>) => Promise<void> }) {
  const [tipo, setTipo] = useState<"produto" | "ficha">("produto");
  const [q, setQ] = useState(sugestao.replace(/\s*\d.*$/, ""));
  const [res, setRes] = useState<{ id: string; nome: string; extra: string }[]>([]);
  const [buscando, setBuscando] = useState(false);
  useEffect(() => {
    let vivo = true;
    const t = setTimeout(async () => {
      if (q.trim().length < 2) { setRes([]); return; }
      setBuscando(true);
      const r = tipo === "produto"
        ? (await buscarProdutos(q)).map((p) => ({ id: p.id, nome: p.nome, extra: `${p.preco_referencia != null ? brl(Number(p.preco_referencia)) : "sem preço"}/${p.unidade}` }))
        : (await buscarFichas(q, fichaId)).map((f) => ({ id: f.id, nome: f.nome, extra: f.rendimento_kg ? `rende ${numBR(Number(f.rendimento_kg))} kg` : "sem rendimento" }));
      if (vivo) { setRes(r); setBuscando(false); }
    }, 250);
    return () => { vivo = false; clearTimeout(t); };
  }, [q, tipo, fichaId]);
  const aba = (on: boolean) => `min-h-11 rounded-full px-4 text-sm font-semibold ${on ? "bg-texto text-painel-fundo" : "bg-painel-cartao text-texto"}`;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={aba(tipo === "produto")} onClick={() => setTipo("produto")}>Produto do estoque</button>
        <button type="button" className={aba(tipo === "ficha")} onClick={() => setTipo("ficha")}>Outra ficha</button>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" aria-label="Buscar" className="campo w-64" autoFocus />
        <button type="button" onClick={fechar} className="btn-secundario min-h-11 px-4">Fechar</button>
        {buscando && <span className="text-xs text-texto-fraco">buscando…</span>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {res.map((r) => (
          <BotaoAcao key={r.id} className="min-h-11 rounded-full bg-painel-cartao px-3 text-left text-sm text-texto shadow-sm"
            aoClicar={async () => { await rodar(ligarItem(fichaId, itemId, tipo === "produto" ? { produtoId: r.id } : { subFichaId: r.id })); fechar(); }}>
            {r.nome} <span className="text-xs text-texto-fraco">· {r.extra}</span>
          </BotaoAcao>
        ))}
        {!buscando && q.trim().length >= 2 && res.length === 0 && <p className="text-sm text-texto-suave">Nada com esse nome. Tente outra palavra{tipo === "produto" ? " ou cadastre o produto em Produtos" : ""}.</p>}
      </div>
      <BotaoAcao className="text-xs font-semibold text-texto-suave hover:underline" aoClicar={async () => { await rodar(ligarItem(fichaId, itemId, {})); fechar(); }}>
        Deixar sem ligação (usa o preço da planilha)
      </BotaoAcao>
    </div>
  );
}

/** Pratos do cardápio do dia que usam esta ficha (pro custo aparecer no cardápio). */
function PratosLigados({ fichaId, pratos, rodar }: { fichaId: string; pratos: { id: string; nome: string }[]; rodar: (p: Promise<{ ok: boolean; erro?: string }>) => Promise<void> }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<{ id: string; nome: string; grupo: string; ficha_id: string | null }[]>([]);
  useEffect(() => {
    let vivo = true;
    const t = setTimeout(async () => {
      const r = q.trim().length >= 2 ? await buscarPratos(q) : [];
      if (vivo) setRes(r);
    }, 250);
    return () => { vivo = false; clearTimeout(t); };
  }, [q]);
  return (
    <div className="cartao p-4 text-sm">
      <p className="rotulo">Pratos do cardápio do dia</p>
      {pratos.length > 0 ? (
        <ul className="mt-1 space-y-1">
          {pratos.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2">
              <span className="font-semibold text-texto">{p.nome}</span>
              <BotaoAcao aria-label={`Tirar ${p.nome}`} className="h-11 w-11 rounded-controle text-urgente-texto" aoClicar={() => rodar(ligarPrato(fichaId, p.id, false))}>✕</BotaoAcao>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-texto-suave">Nenhum. Ligue pra o custo aparecer quando o prato entrar no cardápio. Dá pra ligar vários nomes à mesma ficha.</p>
      )}
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ligar mais um prato" aria-label="Buscar prato do cardápio" className="campo mt-2 w-full" />
      <div className="mt-1 flex flex-wrap gap-1.5">
        {res.filter((r) => r.ficha_id !== fichaId).map((r) => (
          <BotaoAcao key={r.id} className="min-h-11 rounded-full bg-superficie-suave px-3 text-left text-sm text-texto" aoClicar={async () => { await rodar(ligarPrato(fichaId, r.id, true)); setQ(""); }}>
            {r.nome}{r.ficha_id ? <span className="text-xs text-texto-fraco"> · troca a ficha dele</span> : null}
          </BotaoAcao>
        ))}
      </div>
    </div>
  );
}
