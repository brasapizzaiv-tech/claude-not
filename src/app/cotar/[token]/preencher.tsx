"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { dataBR } from "@/lib/format";
import { salvarPrecosPublico, removerItemPublico, type DadosCotacao } from "./actions";

export type LinhaPreco = {
  produto_id: string;
  nome: string;
  unidade: string;
  marca: string | null;
  qtd: number;
  preco_unit: number | null;
  disponivel: boolean;
  foto_url: string | null;
  embalagem: string | null;
  tamanho_embalagem: string | null;
  observacao: string | null;
  tem_st: boolean;
  st_pct_padrao: number | null;
  st_inclusa: boolean | null;
  st_pct: number | null;
  extras?: {
    id: string;
    marca: string | null;
    preco_unit: number | null;
    embalagem: string | null;
    tamanho_embalagem: string | null;
    observacao: string | null;
    st_inclusa: boolean | null;
    st_pct: number | null;
  }[];
};

// Oferta extra (outra marca) editável no formulário.
type ExtraLinha = {
  marca: string;
  preco: string;
  embalagem: string;
  tamanho: string;
  obs: string;
  st_inclusa: boolean;
  st_pct: string;
};

type Meta = {
  prazo_entrega: string;
  pedido_minimo: string;
  condicao_pagamento: string;
  observacao: string;
  promocao_texto: string;
  promocao_foto: string;
};

const EMBALAGENS = ["Unidade", "Fardo", "Caixa", "Pacote", "Kg", "Dúzia", "Saco", "Bandeja", "Litro"];

const campo =
  "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

export function CotarPreencher({
  token,
  descricao,
  fornecedor,
  prazo,
  fechada,
  produtos,
  outros,
  meta,
  jaEnviadoEm,
}: {
  token: string;
  descricao: string;
  fornecedor: string;
  prazo: string | null;
  fechada: boolean;
  produtos: LinhaPreco[];
  outros: LinhaPreco[];
  meta: Meta;
  jaEnviadoEm?: string | null;
}) {
  // Itens que ele já fornece + os "outros" da cotação (que ele pode incluir).
  const todos = [...produtos, ...outros];
  const formRef = useRef<HTMLFormElement>(null);
  const [enviando, startSend] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState<"idle" | "salvando" | "ok">("idle");
  const [indisp, setIndisp] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(todos.map((p) => [p.produto_id, !p.disponivel])),
  );
  const [removidos, setRemovidos] = useState<Set<string>>(new Set());
  const [dados, setDados] = useState<Meta>(meta);
  const [emb, setEmb] = useState<Record<string, string>>(() =>
    Object.fromEntries(todos.map((p) => [p.produto_id, p.embalagem ?? ""])),
  );
  // Preço por item — controlado por estado (não lê do DOM, evita "falta" falso).
  const [precos, setPrecos] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      todos.map((p) => [p.produto_id, p.preco_unit != null ? String(p.preco_unit) : ""]),
    ),
  );
  const [obs, setObs] = useState<Record<string, string>>(() =>
    Object.fromEntries(todos.map((p) => [p.produto_id, p.observacao ?? ""])),
  );
  // ST por item: "inclusa" (o preço já inclui a ST?) e a % informada.
  const [stInc, setStInc] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(todos.map((p) => [p.produto_id, p.st_inclusa ?? false])),
  );
  const [stPct, setStPct] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      todos.map((p) => [
        p.produto_id,
        p.st_pct != null ? String(p.st_pct) : p.st_pct_padrao != null ? String(p.st_pct_padrao) : "",
      ]),
    ),
  );
  const [fotos, setFotos] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      todos.filter((p) => p.foto_url).map((p) => [p.produto_id, p.foto_url!]),
    ),
  );
  // "Outros" itens que o fornecedor decidiu incluir/cotar. Já vêm incluídos os
  // que ele tiver preço salvo de um rascunho anterior.
  const [incluidos, setIncluidos] = useState<Set<string>>(
    () => new Set(outros.filter((o) => o.preco_unit != null).map((o) => o.produto_id)),
  );
  const [buscaOutros, setBuscaOutros] = useState("");
  // Tamanho da embalagem por item (ex.: "fardo 12", "5kg") — separa preços que
  // só diferem pelo tamanho.
  const [tam, setTam] = useState<Record<string, string>>(() =>
    Object.fromEntries(todos.map((p) => [p.produto_id, p.tamanho_embalagem ?? ""])),
  );
  // Ofertas extras (outras marcas) por item.
  const [extras, setExtras] = useState<Record<string, ExtraLinha[]>>(() =>
    Object.fromEntries(
      todos.map((p) => [
        p.produto_id,
        (p.extras ?? []).map((e) => ({
          marca: e.marca ?? "",
          preco: e.preco_unit != null ? String(e.preco_unit) : "",
          embalagem: e.embalagem ?? "",
          tamanho: e.tamanho_embalagem ?? "",
          obs: e.observacao ?? "",
          st_inclusa: e.st_inclusa ?? false,
          st_pct: e.st_pct != null ? String(e.st_pct) : "",
        })),
      ]),
    ),
  );
  const [subindo, setSubindo] = useState<Record<string, boolean>>({});
  const [subindoPromo, setSubindoPromo] = useState(false);
  const supabase = useMemo(() => createClient(), []);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Normaliza número em formato brasileiro: "2,99" → "2.99", "1.234,56" →
  // "1234.56", "R$ 3,90" → "3.90". Se não der pra entender, devolve "".
  const normNum = (raw: string) => {
    let s = (raw || "").replace(/[^\d.,-]/g, "").trim();
    if (!s) return "";
    if (s.includes(",")) s = s.replace(/\./g, "").replace(/,/g, ".");
    const n = Number(s);
    return Number.isFinite(n) ? String(n) : "";
  };

  // Preço do item, normalizado.
  const precoDe = (produtoId: string) => normNum(precos[produtoId] ?? "");

  // Itens ativos = os que ele fornece (menos removidos) + os "outros" incluídos.
  const ativos = [
    ...produtos.filter((p) => !removidos.has(p.produto_id)),
    ...outros.filter((o) => incluidos.has(o.produto_id)),
  ];
  const outrosDisponiveis = outros.filter(
    (o) => !incluidos.has(o.produto_id) && !removidos.has(o.produto_id),
  );

  function montarPrecos() {
    return ativos
      .map((p) => ({
        produto_id: p.produto_id,
        preco_unit: indisp[p.produto_id] ? "" : precoDe(p.produto_id),
        disponivel: !indisp[p.produto_id],
        foto_url: fotos[p.produto_id] ?? "",
        embalagem: emb[p.produto_id] ?? "",
        tamanho_embalagem: tam[p.produto_id] ?? "",
        observacao: obs[p.produto_id] ?? "",
        st_inclusa: p.tem_st ? String(!!stInc[p.produto_id]) : "",
        st_pct: p.tem_st ? normNum(stPct[p.produto_id] ?? "") : "",
        extras: (extras[p.produto_id] ?? [])
          .filter((x) => x.preco.trim() || x.marca.trim())
          .map((x) => ({
            marca: x.marca.trim(),
            preco_unit: normNum(x.preco),
            embalagem: x.embalagem,
            tamanho_embalagem: x.tamanho,
            observacao: x.obs,
            st_inclusa: p.tem_st ? String(!!x.st_inclusa) : "",
            st_pct: p.tem_st ? normNum(x.st_pct) : "",
          })),
      }));
  }

  // Payload do rascunho, sempre com o estado MAIS RECENTE (ref atualizado a cada
  // render). Assim o auto-save agendado não grava valores antigos por closure.
  const payloadRef = useRef<() => DadosCotacao>(() => ({ precos: [], prazo_entrega: "", pedido_minimo: "", condicao_pagamento: "", observacao: "" }));
  useEffect(() => {
    payloadRef.current = () => ({
      precos: montarPrecos(),
      ...dados,
      pedido_minimo: normNum(dados.pedido_minimo),
      rascunho: true,
    });
  });

  // Auto-save (rascunho): grava sozinho ~1,2s depois de qualquer mudança,
  // pra não perder nada se o fornecedor sair e voltar.
  function agendarSalvar() {
    if (fechada) return;
    setSalvo("salvando");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const r = await salvarPrecosPublico(token, payloadRef.current());
        setSalvo(r?.ok ? "ok" : "idle");
      } catch {
        // Rede caiu ou a página ficou aberta durante uma atualização do sistema.
        // Não trava — o fornecedor tenta de novo (ou o próximo autosave resolve).
        setSalvo("idle");
      }
    }, 1200);
  }

  async function enviarFoto(produtoId: string, file: File) {
    setSubindo((s) => ({ ...s, [produtoId]: true }));
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${token}/${produtoId}-${new Date().getTime()}.${ext}`;
    const { error } = await supabase.storage
      .from("cotacao-fotos")
      .upload(path, file, { upsert: true });
    if (!error) {
      const { data } = supabase.storage.from("cotacao-fotos").getPublicUrl(path);
      setFotos((s) => ({ ...s, [produtoId]: data.publicUrl }));
      agendarSalvar();
    }
    setSubindo((s) => ({ ...s, [produtoId]: false }));
  }

  async function enviarFotoPromo(file: File) {
    setSubindoPromo(true);
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${token}/promocao-${new Date().getTime()}.${ext}`;
    const { error } = await supabase.storage
      .from("cotacao-fotos")
      .upload(path, file, { upsert: true });
    if (!error) {
      const { data } = supabase.storage.from("cotacao-fotos").getPublicUrl(path);
      setDados((d) => ({ ...d, promocao_foto: data.publicUrl }));
      agendarSalvar();
    }
    setSubindoPromo(false);
  }

  function enviar() {
    // Data de entrega é obrigatória.
    if (!dados.prazo_entrega) {
      setMsg(null);
      setErro("Informe a data de entrega prevista (obrigatório) lá embaixo, em “Condições do pedido”.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    // Valida: cada item disponível precisa de preço e de embalagem/unidade.
    const faltando: string[] = [];
    for (const p of ativos) {
      if (removidos.has(p.produto_id) || indisp[p.produto_id]) continue;
      const bruto = (precos[p.produto_id] ?? "").trim();
      if (!bruto) faltando.push(`preço de ${p.nome}`);
      else if (!precoDe(p.produto_id)) faltando.push(`preço de ${p.nome} — "${bruto}" não é um número válido`);
      if (!(emb[p.produto_id] ?? "").trim()) faltando.push(`unidade de ${p.nome}`);
    }
    if (faltando.length > 0) {
      setMsg(null);
      const lista = faltando.slice(0, 8).join("; ");
      const resto = faltando.length > 8 ? ` e mais ${faltando.length - 8}` : "";
      setErro(`Faltou preencher: ${lista}${resto}. (Se algum estiver em falta, marque "Em falta".)`);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setErro(null);
    startSend(async () => {
      try {
        const r = await salvarPrecosPublico(token, {
          precos: montarPrecos(),
          ...dados,
          pedido_minimo: normNum(dados.pedido_minimo),
        });
        if (r?.ok) {
          setErro(null);
          setMsg("Preços enviados! Obrigado. Você pode revisar e reenviar se quiser.");
          setTimeout(() => setMsg(null), 6000);
        } else {
          setMsg(null);
          setErro(r?.erro ?? "Não foi possível enviar. Tente de novo.");
        }
      } catch {
        // A chamada falhou (internet caiu ou o sistema foi atualizado com a
        // página aberta). Os dados ficam salvos aqui automaticamente.
        setMsg(null);
        setErro(
          "Não conseguimos enviar agora. Seus preços ficam salvos automaticamente nesta página — atualize a página (F5) e clique em Enviar de novo.",
        );
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  async function naoTrabalho(produtoId: string, nome: string) {
    if (
      !window.confirm(
        `Confirmar que você NÃO trabalha com "${nome}"? Ele não aparecerá nas próximas cotações.`,
      )
    )
      return;
    setRemovidos((s) => new Set(s).add(produtoId));
    try {
      await removerItemPublico(token, produtoId);
    } catch {
      /* rede/atualização — a remoção some da tela; recarregar reflete o servidor */
    }
  }

  function incluirOutro(produtoId: string) {
    setIncluidos((s) => new Set(s).add(produtoId));
    agendarSalvar();
  }
  function addExtra(pid: string) {
    setExtras((s) => ({
      ...s,
      [pid]: [
        ...(s[pid] ?? []),
        { marca: "", preco: "", embalagem: "", tamanho: "", obs: "", st_inclusa: false, st_pct: "" },
      ],
    }));
  }
  function setExtra(pid: string, i: number, campo: keyof ExtraLinha, v: string | boolean) {
    setExtras((s) => ({
      ...s,
      [pid]: (s[pid] ?? []).map((x, idx) => (idx === i ? { ...x, [campo]: v } : x)),
    }));
    agendarSalvar();
  }
  function removeExtra(pid: string, i: number) {
    setExtras((s) => ({ ...s, [pid]: (s[pid] ?? []).filter((_, idx) => idx !== i) }));
    agendarSalvar();
  }

  const buscaOut = buscaOutros.trim().toLowerCase();
  const outrosFiltrados = buscaOut
    ? outrosDisponiveis.filter((o) => o.nome.toLowerCase().includes(buscaOut))
    : outrosDisponiveis;

  return (
    <div className="min-h-screen bg-zinc-50 pb-24 dark:bg-zinc-950">
      <div className="sticky top-0 z-10 border-b border-zinc-200 bg-white px-4 py-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">{descricao}</h1>
        <p className="text-sm text-zinc-500">
          Cotação para <b>{fornecedor}</b>
          {prazo ? ` · prazo ${dataBR(prazo)}` : ""}
        </p>
      </div>

      <div className="mx-auto max-w-xl px-4">
        {msg && (
          <div className="mt-4 rounded-lg bg-green-100 px-4 py-3 text-sm font-medium text-green-800 dark:bg-green-950 dark:text-green-300">
            {msg}
          </div>
        )}
        {erro && (
          <div className="mt-4 rounded-lg bg-red-100 px-4 py-3 text-sm font-medium text-red-800 dark:bg-red-950 dark:text-red-300">
            ⚠️ {erro}
          </div>
        )}

        {fechada && (
          <div className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-950 dark:text-amber-300">
            Esta cotação está fechada. Os preços não podem mais ser alterados.
          </div>
        )}

        {!fechada && jaEnviadoEm && !msg && (
          <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-300">
            ✅ Você já enviou esta cotação
            {jaEnviadoEm !== "sim"
              ? ` em ${new Date(jaEnviadoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`
              : ""}
            . Se algo mudou, é só ajustar e clicar em <b>Enviar preços</b> de novo.
          </div>
        )}

        <p className="mt-4 text-sm text-zinc-500">
          Informe o <b>preço</b> e a <b>unidade/embalagem</b> (fardo, caixa, unidade...) de cada
          item. Se estiver <b>em falta</b>, marque o botão. O que você preencher é{" "}
          <b>salvo automaticamente</b> — pode sair e voltar sem perder.
        </p>

        <form ref={formRef} className="mt-4 space-y-3">
          {ativos.map((p) => {
            const emFalta = indisp[p.produto_id];
            return (
              <div
                key={p.produto_id}
                className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-zinc-900 dark:text-zinc-100">{p.nome}</p>
                    <p className="text-xs text-zinc-400">
                      {p.marca ? `${p.marca} · ` : ""}Qtd: {p.qtd} {p.unidade}
                    </p>
                  </div>
                  {!fechada && (
                    <button
                      type="button"
                      onClick={() => naoTrabalho(p.produto_id, p.nome)}
                      className="shrink-0 rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:border-red-300 hover:bg-red-50 hover:text-red-600 dark:border-zinc-600 dark:text-zinc-300 dark:hover:border-red-800 dark:hover:bg-red-950"
                    >
                      🚫 Não trabalho
                    </button>
                  )}
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <span className="text-sm text-zinc-400">R$</span>
                  <input
                    name={`preco_${p.produto_id}`}
                    inputMode="decimal"
                    placeholder="0,00"
                    disabled={fechada || emFalta}
                    value={precos[p.produto_id] ?? ""}
                    onChange={(e) => {
                      setPrecos((s) => ({ ...s, [p.produto_id]: e.target.value }));
                      agendarSalvar();
                    }}
                    className={`${campo} flex-1 text-right ${emFalta ? "opacity-40" : ""}`}
                  />
                  <button
                    type="button"
                    disabled={fechada}
                    onClick={() => {
                      setIndisp((s) => ({ ...s, [p.produto_id]: !s[p.produto_id] }));
                      agendarSalvar();
                    }}
                    className={`shrink-0 rounded-lg border px-3 py-2 text-xs font-medium ${
                      emFalta
                        ? "border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                        : "border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    }`}
                  >
                    {emFalta ? "✓ Em falta" : "Em falta"}
                  </button>
                </div>

                {/* Embalagem / unidade de venda + tamanho */}
                {!emFalta && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-zinc-500">Preço por (embalagem)</label>
                      <select
                        value={emb[p.produto_id] ?? ""}
                        disabled={fechada}
                        onChange={(e) => {
                          setEmb((s) => ({ ...s, [p.produto_id]: e.target.value }));
                          agendarSalvar();
                        }}
                        className={`${campo} mt-1 w-full`}
                      >
                        <option value="">Selecione...</option>
                        {EMBALAGENS.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-zinc-500">Tamanho da embalagem</label>
                      <input
                        value={tam[p.produto_id] ?? ""}
                        disabled={fechada}
                        placeholder="Ex.: 12 un, 5 kg, 1 L"
                        onChange={(e) => {
                          setTam((s) => ({ ...s, [p.produto_id]: e.target.value }));
                          agendarSalvar();
                        }}
                        className={`${campo} mt-1 w-full`}
                      />
                    </div>
                  </div>
                )}

                {/* ST (Substituição Tributária) — só nos produtos marcados */}
                {p.tem_st && !emFalta && (
                  <div className="mt-2 rounded-lg border border-violet-200 bg-violet-50/50 p-2.5 dark:border-violet-900 dark:bg-violet-950/20">
                    <p className="text-xs font-semibold text-violet-800 dark:text-violet-300">
                      ⚠️ Este item tem ICMS-ST
                    </p>
                    <label className="mt-1.5 flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
                      <input
                        type="checkbox"
                        checked={!!stInc[p.produto_id]}
                        disabled={fechada}
                        onChange={(e) => {
                          setStInc((s) => ({ ...s, [p.produto_id]: e.target.checked }));
                          agendarSalvar();
                        }}
                      />
                      A ST já está inclusa no preço acima
                    </label>
                    <div className="mt-2">
                      <label className="text-xs text-zinc-500">% de ST</label>
                      <div className="mt-1 flex items-center gap-1">
                        <input
                          inputMode="decimal"
                          value={stPct[p.produto_id] ?? ""}
                          placeholder="Ex.: 17"
                          disabled={fechada}
                          onChange={(e) => {
                            setStPct((s) => ({ ...s, [p.produto_id]: e.target.value }));
                            agendarSalvar();
                          }}
                          className={`${campo} w-24 text-right`}
                        />
                        <span className="text-sm text-zinc-400">%</span>
                      </div>
                    </div>
                    <p className="mt-1 text-[11px] text-zinc-400">
                      {stInc[p.produto_id]
                        ? "Já inclusa → usamos o preço como está."
                        : "Não inclusa → somamos a % ao preço para o custo real."}
                    </p>
                  </div>
                )}

                {/* Observação do item */}
                {!emFalta && (
                  <div className="mt-2">
                    <label className="text-xs text-zinc-500">Observação (opcional)</label>
                    <input
                      value={obs[p.produto_id] ?? ""}
                      disabled={fechada}
                      placeholder="Ex.: fardo com 12, marca X, promoção..."
                      onChange={(e) => {
                        setObs((s) => ({ ...s, [p.produto_id]: e.target.value }));
                        agendarSalvar();
                      }}
                      className={`${campo} mt-1 w-full`}
                    />
                  </div>
                )}

                {/* Ofertas extras: mesma item, outra marca */}
                {!emFalta && (
                  <div className="mt-2">
                    {(extras[p.produto_id] ?? []).map((x, i) => (
                      <div
                        key={i}
                        className="mt-2 rounded-lg border border-sky-200 bg-sky-50/50 p-2.5 dark:border-sky-900 dark:bg-sky-950/20"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-sky-800 dark:text-sky-300">
                            Outra marca / oferta {i + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeExtra(p.produto_id, i)}
                            className="text-xs text-zinc-400 hover:text-red-600"
                          >
                            remover
                          </button>
                        </div>
                        <input
                          value={x.marca}
                          disabled={fechada}
                          placeholder="Marca (ex.: Sadia, Seara...)"
                          onChange={(e) => setExtra(p.produto_id, i, "marca", e.target.value)}
                          className={`${campo} mt-2 w-full`}
                        />
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <div className="flex items-center gap-1">
                            <span className="text-sm text-zinc-400">R$</span>
                            <input
                              inputMode="decimal"
                              value={x.preco}
                              disabled={fechada}
                              placeholder="0,00"
                              onChange={(e) => setExtra(p.produto_id, i, "preco", e.target.value)}
                              className={`${campo} w-full text-right`}
                            />
                          </div>
                          <input
                            value={x.tamanho}
                            disabled={fechada}
                            placeholder="Tamanho (12 un, 5 kg)"
                            onChange={(e) => setExtra(p.produto_id, i, "tamanho", e.target.value)}
                            className={`${campo} w-full`}
                          />
                        </div>
                        {p.tem_st && (
                          <label className="mt-2 flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                            <input
                              type="checkbox"
                              checked={x.st_inclusa}
                              disabled={fechada}
                              onChange={(e) => setExtra(p.produto_id, i, "st_inclusa", e.target.checked)}
                            />
                            ST inclusa no preço
                            <input
                              inputMode="decimal"
                              value={x.st_pct}
                              disabled={fechada}
                              placeholder="% ST"
                              onChange={(e) => setExtra(p.produto_id, i, "st_pct", e.target.value)}
                              className={`${campo} w-20 text-right`}
                            />
                          </label>
                        )}
                      </div>
                    ))}
                    {!fechada && (
                      <button
                        type="button"
                        onClick={() => addExtra(p.produto_id)}
                        className="mt-2 text-xs font-medium text-sky-600 hover:underline"
                      >
                        + Tenho outra marca deste item
                      </button>
                    )}
                  </div>
                )}

                {/* Foto do produto */}
                {!fechada && (
                  <div className="mt-3 flex items-center gap-3">
                    {fotos[p.produto_id] && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={fotos[p.produto_id]}
                        alt={p.nome}
                        className="h-14 w-14 rounded-lg object-cover"
                      />
                    )}
                    <label className="cursor-pointer text-xs font-medium text-orange-600 hover:underline">
                      {subindo[p.produto_id]
                        ? "Enviando foto..."
                        : fotos[p.produto_id]
                          ? "Trocar foto"
                          : "📷 Adicionar foto"}
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        disabled={subindo[p.produto_id]}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) enviarFoto(p.produto_id, f);
                        }}
                      />
                    </label>
                  </div>
                )}
              </div>
            );
          })}

          {/* Outros itens da cotação que ele ainda não fornece */}
          {!fechada && outrosDisponiveis.length > 0 && (
            <div className="rounded-2xl border border-dashed border-orange-300 bg-orange-50/40 p-4 dark:border-orange-800 dark:bg-orange-950/10">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Outros itens pedidos nesta cotação
              </h2>
              <p className="mt-1 text-xs text-zinc-500">
                A loja também pediu estes itens (a outros fornecedores). Se você
                trabalha com algum, clique em <b>Tenho / Cotar</b> — ele entra na
                sua lista acima para você preço.
              </p>
              <input
                value={buscaOutros}
                onChange={(e) => setBuscaOutros(e.target.value)}
                placeholder="🔎 Buscar item..."
                className={`${campo} mt-3 w-full`}
              />
              <div className="mt-2 divide-y divide-zinc-200 dark:divide-zinc-800">
                {outrosFiltrados.map((o) => (
                  <div
                    key={o.produto_id}
                    className="flex items-center justify-between gap-2 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-200">
                        {o.nome}
                      </p>
                      <p className="text-xs text-zinc-400">
                        {o.marca ? `${o.marca} · ` : ""}Qtd: {o.qtd} {o.unidade}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => incluirOutro(o.produto_id)}
                      className="shrink-0 rounded-lg border border-orange-400 px-3 py-1.5 text-xs font-medium text-orange-700 hover:bg-orange-100 dark:text-orange-300 dark:hover:bg-orange-950"
                    >
                      + Tenho / Cotar
                    </button>
                  </div>
                ))}
                {outrosFiltrados.length === 0 && (
                  <p className="py-2 text-xs text-zinc-400">Nenhum item encontrado.</p>
                )}
              </div>
            </div>
          )}

          {/* Promoção / oferta do fornecedor */}
          {!fechada && (
            <div className="rounded-2xl border border-violet-200 bg-violet-50/40 p-4 dark:border-violet-900 dark:bg-violet-950/10">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                🎁 Tem alguma promoção ou oferta?
              </h2>
              <p className="mt-1 text-xs text-zinc-500">
                Se quiser oferecer algo além da lista (um combo, um item em
                promoção), escreva aqui e, se quiser, mande uma foto.
              </p>
              <textarea
                rows={2}
                value={dados.promocao_texto}
                onChange={(e) => {
                  setDados((d) => ({ ...d, promocao_texto: e.target.value }));
                  agendarSalvar();
                }}
                placeholder="Ex.: Caixa de tomate pelado em promoção esta semana a R$ ..."
                className={`${campo} mt-2 w-full`}
              />
              <div className="mt-2 flex items-center gap-3">
                {dados.promocao_foto && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={dados.promocao_foto}
                    alt="promoção"
                    className="h-16 w-16 rounded-lg object-cover"
                  />
                )}
                <label className="cursor-pointer text-xs font-medium text-violet-600 hover:underline">
                  {subindoPromo
                    ? "Enviando foto..."
                    : dados.promocao_foto
                      ? "Trocar foto"
                      : "📷 Adicionar foto da oferta"}
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    disabled={subindoPromo}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) enviarFotoPromo(f);
                    }}
                  />
                </label>
              </div>
            </div>
          )}

          {/* Rodapé: condições do fornecedor */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Condições do pedido
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-zinc-500">
                Entrega prevista <span className="text-red-500">* obrigatório</span>
                <input
                  type="date"
                  required
                  value={dados.prazo_entrega}
                  disabled={fechada}
                  onChange={(e) => {
                    setDados((d) => ({ ...d, prazo_entrega: e.target.value }));
                    agendarSalvar();
                  }}
                  className={`${campo} mt-1 w-full ${
                    !dados.prazo_entrega ? "border-red-300 dark:border-red-800" : ""
                  }`}
                />
              </label>
              <label className="text-xs text-zinc-500">
                Pedido mínimo (R$)
                <input
                  inputMode="decimal"
                  placeholder="0,00"
                  value={dados.pedido_minimo}
                  disabled={fechada}
                  onChange={(e) => {
                    setDados((d) => ({ ...d, pedido_minimo: e.target.value }));
                    agendarSalvar();
                  }}
                  className={`${campo} mt-1 w-full`}
                />
              </label>
            </div>
            <label className="mt-3 block text-xs text-zinc-500">
              Condição de pagamento
              <input
                placeholder="Ex.: 28 dias, boleto"
                value={dados.condicao_pagamento}
                disabled={fechada}
                onChange={(e) => {
                  setDados((d) => ({ ...d, condicao_pagamento: e.target.value }));
                  agendarSalvar();
                }}
                className={`${campo} mt-1 w-full`}
              />
            </label>
            <label className="mt-3 block text-xs text-zinc-500">
              Observações gerais
              <textarea
                rows={2}
                value={dados.observacao}
                disabled={fechada}
                onChange={(e) => {
                  setDados((d) => ({ ...d, observacao: e.target.value }));
                  agendarSalvar();
                }}
                className={`${campo} mt-1 w-full`}
              />
            </label>
          </div>
        </form>
      </div>

      {!fechada && (
        <div className="fixed inset-x-0 bottom-0 border-t border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mx-auto max-w-xl">
            <p className="mb-1 text-center text-xs text-zinc-400">
              {salvo === "salvando"
                ? "Salvando rascunho..."
                : salvo === "ok"
                  ? "✓ Rascunho salvo automaticamente"
                  : "Suas respostas são salvas automaticamente"}
            </p>
            <button
              onClick={enviar}
              disabled={enviando}
              className="w-full rounded-xl bg-orange-500 py-3 text-center font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
            >
              {enviando ? "Enviando..." : "Enviar preços"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
