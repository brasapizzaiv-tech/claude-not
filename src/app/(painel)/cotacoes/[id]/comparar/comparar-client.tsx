"use client";

import { Icone } from "@/components/icone";
import { avisar, confirmar } from "@/components/dialogo";

import { Fragment, useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { dataBR } from "@/lib/format";
import { gerarPedidos, novaCotacaoDosFaltantes, adiantarPedidoFornecedor } from "../../actions";

export type FornecedorCol = {
  id: string;
  nome: string;
  whatsapp: string | null;
  status: string;
  respondido_em: string | null;
  prazo_entrega: string | null;
  pedido_minimo: number | null;
  condicao_pagamento: string | null;
  observacao: string | null;
  promocaoTexto: string | null;
  promocaoFoto: string | null;
};

export type ExclusivoLinha = {
  produto_id: string;
  nome: string;
  unidade: string;
  categoria: string;
  qtd: number;
  fornecedorId: string;
  fornecedorNome: string;
};

export type CelExtra = {
  id: string;
  marca: string | null;
  preco: number | null;
  precoBruto: number | null;
  temSt: boolean;
  tam: string | null;
  obs: string | null;
};
export type Cel = {
  preco: number | null;
  precoBruto: number | null;
  temSt: boolean;
  disp: boolean;
  foto: string | null;
  emb: string | null;
  tam: string | null;
  obs: string | null;
  extras: CelExtra[];
};

export type ProdutoLinha = {
  produto_id: string;
  nome: string;
  unidade: string;
  categoria: string;
  qtd: number;
  precos: Record<string, Cel>;
  melhorForn: string | null;
};

// Embalagem "Unidade" em todo preço só poluía a tela: só mostra quando diz algo.
const embUtil = (e: string | null) => (e && !/^(unidade|un|und|unid)\.?$/i.test(e.trim()) ? e : null);

const moeda = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });


export function CompararClient({
  cotacaoId,
  produtos,
  fornecedores,
  exclusivos,
  ultimaCompra,
  travada,
  fornecedoresComPedido,
}: {
  cotacaoId: string;
  produtos: ProdutoLinha[];
  fornecedores: FornecedorCol[];
  exclusivos: ExclusivoLinha[];
  ultimaCompra: Record<string, { forn: string; preco: number | null; data: string }>;
  travada: boolean;
  fornecedoresComPedido: string[];
}) {
  const router = useRouter();
  const [salvando, startSave] = useTransition();
  const [gerados, setGerados] = useState<Set<string>>(() => new Set(fornecedoresComPedido));
  const [adiantando, setAdiantando] = useState<string | null>(null);
  const [fotoAberta, setFotoAberta] = useState<string | null>(null);

  // "Conferido": marca os itens que você já revisou / vai pedir.
  // Fica guardado no próprio navegador (não perde ao recarregar).
  const confKey = `cmp_conf_${cotacaoId}`;
  const [conf, setConf] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      return new Set(JSON.parse(localStorage.getItem(confKey) || "[]"));
    } catch {
      return new Set();
    }
  });
  function toggleConf(id: string) {
    setConf((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      try {
        localStorage.setItem(confKey, JSON.stringify([...n]));
      } catch {}
      return n;
    });
  }
  // Escolha por produto: fornecedor_id ou "" (não comprar). Padrão: mais barato,
  // mas o que você escolher fica guardado no navegador (não perde ao voltar).
  const selKey = `cmp_sel_${cotacaoId}`;
  const [escolha, setEscolha] = useState<Record<string, string>>(() => {
    const base = Object.fromEntries(
      produtos.map((p) => [p.produto_id, p.melhorForn ?? ""]),
    );
    if (typeof window === "undefined") return base;
    try {
      const salvo = JSON.parse(localStorage.getItem(selKey) || "{}");
      return { ...base, ...salvo };
    } catch {
      return base;
    }
  });
  // Oferta escolhida por produto: "main" (marca principal) ou id da oferta extra.
  const ofertaKey = `cmp_of_${cotacaoId}`;
  const [oferta, setOferta] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") return {};
    try {
      return JSON.parse(localStorage.getItem(ofertaKey) || "{}");
    } catch {
      return {};
    }
  });
  function escolherOferta(produtoId: string, fornId: string, ofId: string) {
    const jaEsse =
      escolha[produtoId] === fornId && (oferta[produtoId] ?? "main") === ofId;
    setEscolha((s) => {
      const novo = { ...s, [produtoId]: jaEsse ? "" : fornId };
      try {
        localStorage.setItem(selKey, JSON.stringify(novo));
      } catch {}
      return novo;
    });
    setOferta((s) => {
      const novo = { ...s, [produtoId]: jaEsse ? "main" : ofId };
      try {
        localStorage.setItem(ofertaKey, JSON.stringify(novo));
      } catch {}
      return novo;
    });
  }

  // Quantidade desejada por produto (editável) — persistida.
  const qtdKey = `cmp_qtd_${cotacaoId}`;
  const [qtds, setQtds] = useState<Record<string, number>>(() => {
    const base = Object.fromEntries(produtos.map((p) => [p.produto_id, p.qtd]));
    if (typeof window === "undefined") return base;
    try {
      return { ...base, ...JSON.parse(localStorage.getItem(qtdKey) || "{}") };
    } catch {
      return base;
    }
  });
  function setQtd(pid: string, v: number) {
    setQtds((s) => {
      const n = { ...s, [pid]: v };
      try {
        localStorage.setItem(qtdKey, JSON.stringify(n));
      } catch {}
      return n;
    });
  }

  // Dividir um item entre vários fornecedores.
  const divKey = `cmp_div_${cotacaoId}`;
  const [divisao, setDivisao] = useState<Record<string, Record<string, number>>>(() => {
    if (typeof window === "undefined") return {};
    try {
      return JSON.parse(localStorage.getItem(divKey) || "{}");
    } catch {
      return {};
    }
  });
  const dividKey = `cmp_dividindo_${cotacaoId}`;
  const [dividindo, setDividindo] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      return new Set(JSON.parse(localStorage.getItem(dividKey) || "[]"));
    } catch {
      return new Set();
    }
  });
  function setDivQty(pid: string, fid: string, v: number) {
    setDivisao((s) => {
      const cur = { ...(s[pid] || {}) };
      if (v > 0) cur[fid] = v;
      else delete cur[fid];
      const n = { ...s, [pid]: cur };
      try {
        localStorage.setItem(divKey, JSON.stringify(n));
      } catch {}
      return n;
    });
  }
  function toggleDividir(pid: string) {
    const jaDiv = dividindo.has(pid);
    const n = new Set(dividindo);
    if (jaDiv) n.delete(pid);
    else n.add(pid);
    setDividindo(n);
    try {
      localStorage.setItem(dividKey, JSON.stringify([...n]));
    } catch {}
    if (!jaDiv) {
      const fid = escolha[pid];
      if (fid) setDivQty(pid, fid, qtds[pid] ?? 0);
    }
  }

  // Alocação final por produto: {fornecedor_id: qtd}.
  const alocacaoDe = useCallback(
    (pid: string): Record<string, number> => {
      if (dividindo.has(pid)) {
        const d = divisao[pid] || {};
        const r: Record<string, number> = {};
        for (const [fid, q] of Object.entries(d)) if (q > 0) r[fid] = q;
        return r;
      }
      const fid = escolha[pid];
      const q = qtds[pid] ?? 0;
      return fid && q > 0 ? { [fid]: q } : {};
    },
    [dividindo, divisao, escolha, qtds],
  );

  // Preço efetivo do fornecedor para o produto, já com a oferta (marca) escolhida.
  const precoDe = useCallback(
    (p: ProdutoLinha, fid: string): { preco: number | null; marca: string | null } => {
      const cel = p.precos[fid];
      if (!cel) return { preco: null, marca: null };
      if (!dividindo.has(p.produto_id) && escolha[p.produto_id] === fid) {
        const ofId = oferta[p.produto_id];
        if (ofId && ofId !== "main") {
          const ex = cel.extras.find((e) => e.id === ofId);
          if (ex) return { preco: ex.preco, marca: ex.marca };
        }
      }
      return { preco: cel.preco, marca: null };
    },
    [dividindo, escolha, oferta],
  );

  const totalPorForn = useMemo(() => {
    const t: Record<string, number> = {};
    for (const f of fornecedores) t[f.id] = 0;
    for (const p of produtos) {
      for (const [fid, q] of Object.entries(alocacaoDe(p.produto_id))) {
        const { preco } = precoDe(p, fid);
        if (preco != null) t[fid] += preco * q;
      }
    }
    return t;
  }, [alocacaoDe, precoDe, produtos, fornecedores]);

  const totalGeral = Object.values(totalPorForn).reduce((a, b) => a + b, 0);
  const itensEscolhidos = produtos.filter(
    (p) => Object.keys(alocacaoDe(p.produto_id)).length > 0,
  ).length;

  function gerar() {
    startSave(async () => {
      const escolhas: {
        fornecedor_id: string;
        produto_id: string;
        qtd: number;
        preco_unit: number | null;
        marca: string | null;
      }[] = [];
      for (const p of produtos) {
        for (const [fid, q] of Object.entries(alocacaoDe(p.produto_id))) {
          const { preco, marca } = precoDe(p, fid);
          escolhas.push({
            fornecedor_id: fid,
            produto_id: p.produto_id,
            qtd: q,
            preco_unit: preco,
            marca,
          });
        }
      }
      // Exclusivos entram direto no pedido do seu único fornecedor (sem preço).
      const diretos = exclusivos.map((e) => ({
        fornecedor_id: e.fornecedorId,
        produto_id: e.produto_id,
        qtd: e.qtd,
        preco_unit: null,
      }));
      await gerarPedidos(cotacaoId, [...escolhas, ...diretos]);
      router.push(`/cotacoes/${cotacaoId}/pedidos`);
    });
  }

  // Itens escolhidos de UM fornecedor (para adiantar só o pedido dele).
  function escolhasDoForn(fid: string) {
    const arr: {
      fornecedor_id: string;
      produto_id: string;
      qtd: number;
      preco_unit: number | null;
      marca: string | null;
    }[] = [];
    for (const p of produtos) {
      const q = alocacaoDe(p.produto_id)[fid];
      if (q) {
        const { preco, marca } = precoDe(p, fid);
        arr.push({ fornecedor_id: fid, produto_id: p.produto_id, qtd: q, preco_unit: preco, marca });
      }
    }
    for (const e of exclusivos) {
      if (e.fornecedorId === fid) {
        arr.push({ fornecedor_id: fid, produto_id: e.produto_id, qtd: e.qtd, preco_unit: null, marca: null });
      }
    }
    return arr;
  }

  // Texto do pedido de um fornecedor (mesmo formato da tela de Pedidos).
  function textoPedidoForn(fid: string, nome: string) {
    const linhas: string[] = [];
    let total = 0;
    for (const p of produtos) {
      const q = alocacaoDe(p.produto_id)[fid];
      if (q) {
        const { preco } = precoDe(p, fid);
        linhas.push(`- ${p.nome}: ${q} ${p.unidade}` + (preco != null ? ` (${moeda(preco)})` : ""));
        if (preco != null) total += preco * q;
      }
    }
    for (const e of exclusivos) {
      if (e.fornecedorId === fid) linhas.push(`- ${e.nome}: ${e.qtd} ${e.unidade}`);
    }
    return `*Pedido - Brasa Pizza*\n${nome}\n\n` + linhas.join("\n") + `\n\nTotal: ${moeda(total)}`;
  }

  function waHref(whatsapp: string | null, texto: string) {
    const zap = (whatsapp ?? "").replace(/\D/g, "");
    return zap
      ? `https://web.whatsapp.com/send?phone=55${zap}&text=${encodeURIComponent(texto)}`
      : "https://web.whatsapp.com/";
  }

  async function adiantar(fid: string, nome: string) {
    const itens = escolhasDoForn(fid);
    if (itens.length === 0) {
      void avisar(`Nenhum item escolhido de ${nome}. Escolha ao menos um item desse fornecedor antes de adiantar.`);
      return;
    }
    if (!await confirmar(`Adiantar o pedido de ${nome} agora (${itens.length} item(ns))? Os outros fornecedores continuam abertos.`))
      return;
    setAdiantando(fid);
    startSave(async () => {
      const r = await adiantarPedidoFornecedor(cotacaoId, fid, itens);
      setAdiantando(null);
      if (r.ok) {
        setGerados((s) => new Set(s).add(fid));
      } else if ("jaGerado" in r) {
        setGerados((s) => new Set(s).add(fid));
      } else if ("travada" in r) {
        void avisar("A cotação já foi fechada — não dá mais para adiantar.");
      }
    });
  }

  // Exclusivos agrupados por fornecedor (para o bloco de pedido direto).
  const exclusivosPorForn = useMemo(() => {
    const m = new Map<string, ExclusivoLinha[]>();
    for (const e of exclusivos) {
      const arr = m.get(e.fornecedorNome) ?? [];
      arr.push(e);
      m.set(e.fornecedorNome, arr);
    }
    return m;
  }, [exclusivos]);

  // ---------- Leitura da tela (pedido do Rafael, 11/10/2026: "difícil de ler,
  // falta informação") ----------

  // Menor preço de cada item entre todos os fornecedores (marca principal ou
  // outra marca): cada preço mostra quanto está acima dele.
  const menorPreco = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of produtos) {
      let min = Infinity;
      for (const cel of Object.values(p.precos)) {
        if (!cel.disp) continue;
        for (const v of [cel.preco, ...cel.extras.map((e) => e.preco)]) if (v != null && v < min) min = v;
      }
      if (min < Infinity) m[p.produto_id] = min;
    }
    return m;
  }, [produtos]);

  // O que foi escolhido em cada item: quanto, por quanto (médio, se dividido)
  // e a diferença pra última compra.
  const linhaEscolha = useCallback(
    (p: ProdutoLinha) => {
      let qtd = 0, total = 0;
      const forns: string[] = [];
      for (const [fid, q] of Object.entries(alocacaoDe(p.produto_id))) {
        const { preco } = precoDe(p, fid);
        if (preco == null) continue;
        qtd += q; total += preco * q; forns.push(fid);
      }
      const medio = qtd > 0 ? total / qtd : null;
      const ult = ultimaCompra[p.produto_id]?.preco ?? null;
      const delta = medio != null && ult != null && ult > 0 ? (medio - ult) / ult : null;
      return { qtd, total, medio, ult, delta, forns };
    },
    [alocacaoDe, precoDe, ultimaCompra],
  );

  // Resumo: comparado à última compra, só nos itens que têm histórico.
  const resumo = useMemo(() => {
    let pagoAntes = 0, pagaAgora = 0, comHist = 0, subiram = 0;
    for (const p of produtos) {
      const l = linhaEscolha(p);
      if (l.medio == null || l.ult == null || l.qtd <= 0) continue;
      comHist++;
      pagoAntes += l.ult * l.qtd;
      pagaAgora += l.medio * l.qtd;
      if (l.delta != null && l.delta > 0.005) subiram++;
    }
    return { diferenca: pagaAgora - pagoAntes, pct: pagoAntes > 0 ? (pagaAgora - pagoAntes) / pagoAntes : null, comHist, subiram };
  }, [produtos, linhaEscolha]);

  // Quem não mandou nenhum preço some da tabela (a coluna inteira seria "–"),
  // com um botão pra mostrar.
  const [mostrarTodos, setMostrarTodos] = useState(false);
  const temPreco = useMemo(() => {
    const s = new Set<string>();
    for (const p of produtos) for (const [fid, cel] of Object.entries(p.precos)) if (cel.preco != null || cel.extras.length) s.add(fid);
    return s;
  }, [produtos]);
  const colunas = fornecedores.filter((f) => mostrarTodos || temPreco.has(f.id) || gerados.has(f.id));
  const escondidos = fornecedores.length - colunas.length;
  const responderam = fornecedores.filter((f) => f.respondido_em || temPreco.has(f.id)).length;

  // Busca e filtro.
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "sem_escolha" | "subiu">("todos");
  const semAcento = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const visiveis = useMemo(() => {
    const b = semAcento(busca.trim());
    return produtos.filter((p) => {
      if (b && !semAcento(p.nome).includes(b)) return false;
      if (filtro === "sem_escolha") return Object.keys(alocacaoDe(p.produto_id)).length === 0;
      if (filtro === "subiu") { const d = linhaEscolha(p).delta; return d != null && d > 0.005; }
      return true;
    });
  }, [produtos, busca, filtro, alocacaoDe, linhaEscolha]);
  const semEscolha = produtos.length - itensEscolhidos;

  const porCategoria = useMemo(() => {
    const m = new Map<string, ProdutoLinha[]>();
    for (const p of visiveis) {
      const arr = m.get(p.categoria) ?? [];
      arr.push(p);
      m.set(p.categoria, arr);
    }
    return m;
  }, [visiveis]);

  const pct = (v: number) => `${v > 0 ? "+" : ""}${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: v !== 0 && Math.abs(v) < 0.1 ? 1 : 0 })}%`;
  const chip = (ativo: boolean) =>
    `rounded-controle px-3 py-1.5 text-sm transition ${ativo ? "bg-texto font-semibold text-fundo" : "bg-superficie-suave text-texto-suave hover:text-texto"}`;
  const nCols = 4 + colunas.length;

  return (
    <div className="mt-6">
      {travada && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-cartao border border-green-300 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950/30">
          <p className="text-sm font-medium text-green-800 dark:text-green-300">
            <Icone nome="cadeado" tamanho={15} className="mr-1.5" /> Esta cotação já gerou pedidos e está travada — os pedidos e
            conferências ficam salvos e não podem ser sobrescritos.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/cotacoes/${cotacaoId}/pedidos`}
              className="rounded-controle bg-texto px-4 py-2 text-sm font-semibold text-fundo hover:opacity-90"
            >
              Ver pedidos →
            </Link>
            <button
              onClick={() => startSave(async () => { await novaCotacaoDosFaltantes(cotacaoId); })}
              disabled={salvando}
              className="rounded-controle border border-green-500 px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-100 disabled:opacity-60 dark:text-green-300 dark:hover:bg-green-900/40"
            >
              Nova cotação com os itens que faltam
            </button>
          </div>
        </div>
      )}

      {/* ---------- Resumo ---------- */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-cartao bg-painel-cartao p-4">
          <p className="text-xs text-texto-fraco">Total do pedido</p>
          <p className="mt-1 font-numero text-2xl font-semibold tracking-apertada text-texto">{moeda(totalGeral)}</p>
          <p className="text-xs text-texto-suave">{itensEscolhidos} de {produtos.length} itens escolhidos</p>
        </div>
        <div className="rounded-cartao bg-painel-cartao p-4">
          <p className="text-xs text-texto-fraco">Comparado à última compra</p>
          {resumo.comHist > 0 ? (
            <>
              <p className={`mt-1 font-numero text-2xl font-semibold tracking-apertada ${resumo.diferenca > 0.005 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                {resumo.diferenca > 0.005 ? "+" : resumo.diferenca < -0.005 ? "−" : ""}{moeda(Math.abs(resumo.diferenca))}
                {resumo.pct != null && <span className="ml-1.5 text-base">({pct(resumo.pct)})</span>}
              </p>
              <p className="text-xs text-texto-suave">
                {resumo.diferenca > 0.005 ? "a mais" : resumo.diferenca < -0.005 ? "de economia" : "igual"} em {resumo.comHist} itens com histórico
                {resumo.subiram > 0 && <> · <button onClick={() => setFiltro("subiu")} className="font-semibold text-red-600 underline dark:text-red-400">{resumo.subiram} subiram</button></>}
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm text-texto-suave">Sem compras anteriores destes itens.</p>
          )}
        </div>
        <div className="rounded-cartao bg-painel-cartao p-4">
          <p className="text-xs text-texto-fraco">Fornecedores</p>
          <p className="mt-1 font-numero text-2xl font-semibold tracking-apertada text-texto">{responderam} <span className="text-base font-normal text-texto-suave">de {fornecedores.length}</span></p>
          <p className="text-xs text-texto-suave">responderam</p>
        </div>
        <div className="rounded-cartao bg-painel-cartao p-4">
          <p className="text-xs text-texto-fraco">Falta escolher</p>
          <p className={`mt-1 font-numero text-2xl font-semibold tracking-apertada ${semEscolha > 0 ? "text-amber-600 dark:text-amber-400" : "text-texto"}`}>{semEscolha}</p>
          <p className="text-xs text-texto-suave">
            {semEscolha > 0 ? <button onClick={() => setFiltro("sem_escolha")} className="underline">ver quais</button> : "tudo escolhido"}
            {conf.size > 0 && <> · {conf.size} conferidos</>}
            {exclusivos.length > 0 && <> · {exclusivos.length} exclusivos</>}
          </p>
        </div>
        <div className="flex items-center rounded-cartao bg-painel-cartao p-4">
          {!travada ? (
            <button
              onClick={gerar}
              disabled={salvando || (itensEscolhidos === 0 && exclusivos.length === 0)}
              className="min-h-11 w-full rounded-controle bg-texto px-4 text-sm font-semibold text-fundo transition hover:opacity-90 disabled:opacity-60"
            >
              {salvando ? "Gerando..." : "Gerar pedidos →"}
            </button>
          ) : (
            <Link href={`/cotacoes/${cotacaoId}/pedidos`} className="w-full rounded-controle bg-texto px-4 py-3 text-center text-sm font-semibold text-fundo">
              Ver pedidos →
            </Link>
          )}
        </div>
      </div>

      {fornecedores.some((f) => f.promocaoTexto || f.promocaoFoto) && (
        <div className="mb-4 rounded-cartao border border-violet-200 bg-violet-50/40 p-4 dark:border-violet-900 dark:bg-violet-950/10">
          <h2 className="text-sm font-semibold text-texto">
            <Icone nome="presente" tamanho={16} className="mr-1.5" /> Ofertas dos fornecedores
          </h2>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {fornecedores
              .filter((f) => f.promocaoTexto || f.promocaoFoto)
              .map((f) => (
                <div
                  key={f.id}
                  className="flex gap-3 rounded-controle border border-violet-200 bg-painel-cartao p-2 dark:border-violet-900"
                >
                  {f.promocaoFoto && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={f.promocaoFoto}
                      alt="oferta"
                      onClick={() => setFotoAberta(f.promocaoFoto)}
                      className="h-14 w-14 cursor-pointer rounded-controle object-cover"
                    />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-texto">
                      {f.nome}
                    </p>
                    <p className="text-xs text-texto-suave">{f.promocaoTexto}</p>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* ---------- Busca e filtros ---------- */}
      {produtos.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar produto…"
            aria-label="Buscar produto"
            className="w-56 rounded-controle border border-borda-forte bg-painel-cartao px-3 py-1.5 text-sm text-texto"
          />
          <button onClick={() => setFiltro("todos")} className={chip(filtro === "todos")}>Todos ({produtos.length})</button>
          <button onClick={() => setFiltro("sem_escolha")} className={chip(filtro === "sem_escolha")}>Sem escolha ({semEscolha})</button>
          <button onClick={() => setFiltro("subiu")} className={chip(filtro === "subiu")}>Mais caro que a última ({resumo.subiram})</button>
          {(escondidos > 0 || mostrarTodos) && (
            <button onClick={() => setMostrarTodos((v) => !v)} className="ml-auto text-sm text-texto-suave underline hover:text-texto">
              {mostrarTodos ? "Esconder quem não mandou preço" : `Mostrar ${escondidos} fornecedor${escondidos > 1 ? "es" : ""} sem preço`}
            </button>
          )}
        </div>
      )}

      {produtos.length > 0 && (
      <div className="max-h-[75vh] overflow-auto cartao">
        <table className="min-w-[560px] w-full text-sm">
          <thead className="text-left text-xs text-texto-suave">
            <tr>
              <th className="sticky left-0 top-0 z-30 bg-superficie-suave px-3 py-3 text-left font-semibold">
                Produto
              </th>
              <th className="sticky top-0 z-20 bg-superficie-suave px-3 py-3 text-right font-semibold">
                Qtd
              </th>
              <th className="sticky top-0 z-20 bg-superficie-suave px-3 py-3 text-right font-semibold">
                Última compra
              </th>
              <th className="sticky top-0 z-20 border-r border-borda bg-superficie-suave px-3 py-3 text-right font-semibold">
                Escolhido
              </th>
              {colunas.map((f) => {
                const respondeu = !!f.respondido_em;
                const hora = f.respondido_em
                  ? new Date(f.respondido_em).toLocaleString("pt-BR", {
                      timeZone: "America/Sao_Paulo",
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : null;
                const detalhes = [
                  f.prazo_entrega ? `entrega ${dataBR(f.prazo_entrega)}` : null,
                  f.pedido_minimo ? `mín. ${moeda(f.pedido_minimo)}` : null,
                  f.condicao_pagamento || null,
                ].filter(Boolean) as string[];
                return (
                  <th
                    key={f.id}
                    className={`sticky top-0 z-20 min-w-[7.5rem] max-w-[11rem] bg-superficie-suave px-3 py-3 text-right align-top ${respondeu || temPreco.has(f.id) ? "" : "opacity-60"}`}
                  >
                    <div className="line-clamp-2 font-semibold text-texto" title={f.nome}>{f.nome}</div>
                    <div className="mt-0.5 text-mini font-normal text-texto-fraco">
                      {respondeu ? `respondeu ${hora}` : temPreco.has(f.id) ? "preço lançado" : "não respondeu"}
                    </div>
                    {detalhes.length > 0 && (
                      <div className="text-mini font-normal text-texto-fraco" title={detalhes.join(" · ")}>
                        {detalhes.map((d) => <div key={d} className="truncate">{d}</div>)}
                      </div>
                    )}
                    <div className="mt-1 flex flex-wrap items-center justify-end gap-1">
                      {gerados.has(f.id) ? (
                        <>
                          <span className="rounded bg-green-100 px-1.5 py-0.5 text-mini font-semibold text-green-700 dark:bg-green-950 dark:text-green-300">
                            ✓ gerado
                          </span>
                          <a
                            href={waHref(f.whatsapp, textoPedidoForn(f.id, f.nome))}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Enviar este pedido pelo WhatsApp"
                            className="rounded bg-texto px-2 py-0.5 text-mini font-semibold text-fundo hover:opacity-90"
                          >
                            <Icone nome="mandar" tamanho={13} className="mr-1" /> Enviar
                          </a>
                        </>
                      ) : (
                        !travada && (totalPorForn[f.id] ?? 0) > 0 && (
                          <button
                            onClick={() => adiantar(f.id, f.nome)}
                            disabled={salvando}
                            title="Gerar só o pedido deste fornecedor agora (sem esperar os outros)"
                            className="rounded bg-orange-500 px-2 py-0.5 text-mini font-semibold text-marca-sobre-primaria hover:brightness-105 disabled:opacity-50"
                          >
                            {adiantando === f.id ? "..." : <span className="inline-flex items-center gap-1"><Icone nome="rapido" tamanho={13} /> Adiantar</span>}
                          </button>
                        )
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visiveis.length === 0 && (
              <tr>
                <td colSpan={nCols} className="px-3 py-8 text-center text-sm text-texto-suave">
                  Nenhum item com esse filtro.{" "}
                  <button onClick={() => { setFiltro("todos"); setBusca(""); }} className="underline">Ver todos</button>
                </td>
              </tr>
            )}
            {[...porCategoria.entries()].map(([cat, itensCat]) => (
              <Fragment key={cat}>
                <tr>
                  <td
                    colSpan={nCols}
                    className="sticky left-0 border-y border-borda bg-superficie-suave px-3 py-1.5 text-xs font-semibold text-texto-suave"
                  >
                    {cat} <span className="font-normal text-texto-fraco">· {itensCat.length}</span>
                  </td>
                </tr>
                {itensCat.map((p) => {
                  const conferido = conf.has(p.produto_id);
                  const l = linhaEscolha(p);
                  const ult = ultimaCompra[p.produto_id];
                  const menor = menorPreco[p.produto_id];
                  const rowBg = conferido ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-painel-cartao";
                  return (
                  <tr
                    key={p.produto_id}
                    className={`group border-b border-borda/60 ${rowBg} hover:bg-superficie-suave`}
                  >
                    <td
                      className={`sticky left-0 z-10 min-w-[13rem] px-3 py-2 font-medium text-texto ${rowBg} group-hover:bg-superficie-suave`}
                    >
                      <div className="flex items-start gap-2">
                        <button
                          type="button"
                          onClick={() => toggleConf(p.produto_id)}
                          title={conferido ? "Conferido — clique para desmarcar" : "Marcar como conferido"}
                          aria-label={conferido ? `Desmarcar ${p.nome}` : `Marcar ${p.nome} como conferido`}
                          className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs ${
                            conferido
                              ? "border-emerald-600 bg-emerald-600 text-white"
                              : "border-zinc-400 text-transparent hover:border-emerald-500 dark:border-zinc-500"
                          }`}
                        >
                          ✓
                        </button>
                        <span>
                          {p.nome}
                          <span className="ml-1 text-xs font-normal text-texto-fraco">{p.unidade}</span>
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-right align-top">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={qtds[p.produto_id] ?? 0}
                        onChange={(e) => setQtd(p.produto_id, Number(e.target.value) || 0)}
                        aria-label={`Quantidade de ${p.nome}`}
                        className="w-16 rounded border border-borda-forte bg-painel-cartao px-1.5 py-1 text-right text-sm text-texto"
                      />
                      <button
                        type="button"
                        onClick={() => toggleDividir(p.produto_id)}
                        className={`mt-0.5 block w-full text-right text-mini ${
                          dividindo.has(p.produto_id)
                            ? "font-medium text-orange-600"
                            : "text-texto-fraco hover:text-orange-600"
                        }`}
                      >
                        {dividindo.has(p.produto_id) ? <span className="inline-flex items-center gap-1"><Icone nome="cortar" tamanho={12} /> dividido</span> : "dividir"}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-right align-top">
                      {ult ? (
                        <>
                          <div className="text-sm text-texto-suave">{ult.preco != null ? moeda(ult.preco) : "—"}</div>
                          <div className="max-w-[9rem] truncate text-mini text-texto-fraco" title={`${ult.forn} · ${ult.data}`}>{ult.forn} · {ult.data.slice(0, 5)}</div>
                        </>
                      ) : (
                        <span className="text-texto-fraco">—</span>
                      )}
                    </td>
                    <td className="border-r border-borda px-3 py-2 text-right align-top">
                      {l.medio != null ? (
                        <>
                          <div className="text-sm font-semibold text-texto">{moeda(l.total)}</div>
                          {l.delta != null && Math.abs(l.delta) >= 0.005 ? (
                            <div className={`whitespace-nowrap text-mini font-semibold ${l.delta > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`} title="Preço escolhido comparado à última compra">
                              {l.delta > 0 ? "↑" : "↓"} {pct(l.delta)} vs última
                            </div>
                          ) : l.delta != null ? (
                            <div className="text-mini text-texto-fraco">igual à última</div>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-mini text-amber-600 dark:text-amber-400">sem escolha</span>
                      )}
                    </td>
                    {colunas.map((f) => {
                      const cel = p.precos[f.id];
                      const escolhido = escolha[p.produto_id] === f.id;
                      const ofSel = oferta[p.produto_id] ?? "main";
                      const melhor = p.melhorForn === f.id;
                      if (!cel) {
                        return (
                          <td key={f.id} className="px-3 py-2 text-right text-texto-fraco/50">
                            –
                          </td>
                        );
                      }
                      if (!cel.disp || cel.preco == null) {
                        return (
                          <td key={f.id} className="px-3 py-2 text-right text-xs text-amber-600 dark:text-amber-400">
                            em falta
                          </td>
                        );
                      }
                      const dividido = dividindo.has(p.produto_id);
                      const acima = menor != null && menor > 0 ? (cel.preco - menor) / menor : 0;
                      const detalhe = [cel.temSt ? (cel.precoBruto != null && Math.abs(cel.preco - cel.precoBruto) > 0.001 ? `c/ ST · bruto ${moeda(cel.precoBruto)}` : "ST inclusa") : null, embUtil(cel.emb), cel.tam, cel.obs].filter(Boolean).join(" · ");
                      return (
                        <td key={f.id} className="px-2 py-1.5 text-right align-top">
                          {dividido ? (
                            <div className="flex items-center justify-end gap-1">
                              <span className="text-mini text-texto-fraco">{moeda(cel.preco)}</span>
                              <input
                                type="number"
                                min={0}
                                step="any"
                                placeholder="0"
                                value={divisao[p.produto_id]?.[f.id] ?? ""}
                                onChange={(e) =>
                                  setDivQty(p.produto_id, f.id, Number(e.target.value) || 0)
                                }
                                aria-label={`Quantidade de ${p.nome} com ${f.nome}`}
                                className={`w-14 rounded border px-1 py-0.5 text-right text-sm ${
                                  (divisao[p.produto_id]?.[f.id] ?? 0) > 0
                                    ? "border-orange-500 bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-200"
                                    : "border-borda-forte dark:bg-zinc-950"
                                }`}
                              />
                            </div>
                          ) : (
                            <div className="space-y-0.5">
                              <button
                                onClick={() => escolherOferta(p.produto_id, f.id, "main")}
                                className={`w-full rounded-controle px-2 py-1 text-right transition ${
                                  escolhido && ofSel === "main"
                                    ? "bg-orange-500 font-semibold text-marca-sobre-primaria"
                                    : melhor
                                      ? "font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-500/60 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                                      : "text-texto-suave hover:bg-superficie-suave"
                                }`}
                                title={detalhe || (melhor ? "Mais barato" : "")}
                              >
                                <span className="block text-sm">{moeda(cel.preco)}</span>
                                {acima >= 0.005 ? (
                                  <span className={`block text-mini font-normal ${escolhido && ofSel === "main" ? "text-white/80" : "text-texto-fraco"}`}>+{(acima * 100).toFixed(0)}%</span>
                                ) : melhor ? (
                                  <span className={`block text-mini font-normal ${escolhido && ofSel === "main" ? "text-white/80" : ""}`}>mais barato</span>
                                ) : null}
                              </button>
                              {cel.extras.map((ex) => (
                                <button
                                  key={ex.id}
                                  onClick={() => escolherOferta(p.produto_id, f.id, ex.id)}
                                  title={ex.obs ?? ""}
                                  className={`flex w-full items-center justify-between gap-1 rounded-controle px-2 py-1 text-mini transition ${
                                    escolhido && ofSel === ex.id
                                      ? "bg-orange-500 font-semibold text-marca-sobre-primaria"
                                      : "bg-superficie-suave text-texto-suave hover:text-texto"
                                  }`}
                                >
                                  <span className="truncate">{ex.marca ?? "outra marca"}</span>
                                  <span>{ex.preco != null ? moeda(ex.preco) : "—"}</span>
                                </button>
                              ))}
                            </div>
                          )}
                          {detalhe && (
                            <div className="mt-0.5 max-w-[11rem] truncate text-right text-mini leading-tight text-texto-fraco" title={detalhe}>
                              {detalhe}
                            </div>
                          )}
                          {cel.foto && (
                            <button
                              type="button"
                              onClick={() => setFotoAberta(cel.foto)}
                              className="mt-0.5 text-mini font-medium text-orange-600 hover:underline"
                            >
                              <Icone nome="camera" tamanho={12} className="mr-1" /> foto
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-borda font-semibold dark:border-borda-forte">
              <td
                className="sticky bottom-0 left-0 z-30 bg-superficie-suave px-3 py-3 text-texto-suave"
                colSpan={3}
              >
                Total escolhido
              </td>
              <td className="sticky bottom-0 z-20 border-r border-borda bg-superficie-suave px-3 py-3 text-right text-texto">
                {moeda(totalGeral)}
              </td>
              {colunas.map((f) => {
                const total = totalPorForn[f.id] ?? 0;
                const abaixoMin =
                  f.pedido_minimo != null &&
                  total > 0 &&
                  total < f.pedido_minimo;
                const nItens = produtos.filter((p) => alocacaoDe(p.produto_id)[f.id]).length;
                return (
                  <td
                    key={f.id}
                    className={`sticky bottom-0 z-20 bg-superficie-suave px-3 py-3 text-right ${
                      abaixoMin
                        ? "text-amber-600"
                        : "text-texto"
                    }`}
                    title={abaixoMin ? `Abaixo do pedido mínimo (${moeda(f.pedido_minimo as number)})` : ""}
                  >
                    {total > 0 ? moeda(total) : "—"}
                    {abaixoMin && <Icone nome="alerta" tamanho={12} className="ml-1 text-amber-600" titulo="Abaixo do mínimo" />}
                    {nItens > 0 && <div className="text-mini font-normal text-texto-fraco">{nItens} {nItens === 1 ? "item" : "itens"}{abaixoMin ? " · abaixo do mín." : ""}</div>}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>
      )}

      {/* Pedido direto: itens com fornecedor exclusivo (sem cotação) */}
      {exclusivos.length > 0 && (
        <div className="mt-4 rounded-cartao border border-indigo-200 bg-indigo-50/50 p-4 dark:border-indigo-900 dark:bg-indigo-950/20">
          <div className="mb-2 flex items-center gap-2">
            <Icone nome="cupom" tamanho={18} />
            <h2 className="font-semibold text-texto">
              Pedido direto — fornecedor exclusivo
            </h2>
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">
              {exclusivos.length} {exclusivos.length === 1 ? "item" : "itens"}
            </span>
          </div>
          <p className="mb-3 text-xs text-texto-suave">
            Esses produtos têm só um fornecedor — não vão pra cotação. Entram
            direto no pedido dele (sem preço; você confirma na entrega/nota).
          </p>
          <div className="space-y-3">
            {[...exclusivosPorForn.entries()].map(([forn, itens]) => (
              <div key={forn} className="cartao p-3">
                <p className="mb-1 text-sm font-semibold text-texto">
                  {forn}
                  <span className="ml-2 text-xs font-normal text-texto-fraco">
                    {itens.length} {itens.length === 1 ? "item" : "itens"}
                  </span>
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-texto-suave">
                  {itens.map((e) => (
                    <span key={e.produto_id}>
                      {e.nome}{" "}
                      <span className="text-xs text-texto-fraco">
                        ({e.qtd} {e.unidade})
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="mt-2 text-xs text-texto-fraco">
        Clique num preço para escolher de quem comprar. <b className="text-emerald-600">Contorno verde</b> = mais barato,{" "}
        <b className="text-orange-600">laranja</b> = escolhido, e o <b>+%</b> diz quanto está acima do mais barato. A coluna{" "}
        <b>Escolhido</b> mostra quanto o item vai custar e se subiu ou baixou desde a última compra. Use <b>dividir</b> pra pedir
        o mesmo item de mais de um fornecedor e o <b>✓</b> pra marcar o que já conferiu (fica guardado neste navegador).
      </p>

      {fotoAberta && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setFotoAberta(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={fotoAberta}
            alt="Foto do produto"
            className="max-h-[90vh] max-w-full rounded-controle object-contain"
          />
          <button
            type="button"
            className="absolute right-4 top-4 text-4xl leading-none text-white/90 hover:text-white"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
