"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { dataBR } from "@/lib/format";
import { salvarPrecosPublico, removerItemPublico } from "./actions";

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
  observacao: string | null;
  tem_st: boolean;
  st_pct_padrao: number | null;
  st_inclusa: boolean | null;
  st_pct: number | null;
};

type Meta = {
  prazo_entrega: string;
  pedido_minimo: string;
  condicao_pagamento: string;
  observacao: string;
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
  meta,
}: {
  token: string;
  descricao: string;
  fornecedor: string;
  prazo: string | null;
  fechada: boolean;
  produtos: LinhaPreco[];
  meta: Meta;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [enviando, startSend] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState<"idle" | "salvando" | "ok">("idle");
  const [indisp, setIndisp] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(produtos.map((p) => [p.produto_id, !p.disponivel])),
  );
  const [removidos, setRemovidos] = useState<Set<string>>(new Set());
  const [dados, setDados] = useState<Meta>(meta);
  const [emb, setEmb] = useState<Record<string, string>>(() =>
    Object.fromEntries(produtos.map((p) => [p.produto_id, p.embalagem ?? ""])),
  );
  const [obs, setObs] = useState<Record<string, string>>(() =>
    Object.fromEntries(produtos.map((p) => [p.produto_id, p.observacao ?? ""])),
  );
  // ST por item: "inclusa" (o preço já inclui a ST?) e a % informada.
  const [stInc, setStInc] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(produtos.map((p) => [p.produto_id, p.st_inclusa ?? false])),
  );
  const [stPct, setStPct] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      produtos.map((p) => [
        p.produto_id,
        p.st_pct != null ? String(p.st_pct) : p.st_pct_padrao != null ? String(p.st_pct_padrao) : "",
      ]),
    ),
  );
  const [fotos, setFotos] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      produtos.filter((p) => p.foto_url).map((p) => [p.produto_id, p.foto_url!]),
    ),
  );
  const [subindo, setSubindo] = useState<Record<string, boolean>>({});
  const supabase = useMemo(() => createClient(), []);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ler = (name: string) => {
    const el = formRef.current?.elements.namedItem(name) as
      | HTMLInputElement
      | undefined;
    return (el?.value ?? "").replace(",", ".").trim();
  };

  function montarPrecos() {
    return produtos
      .filter((p) => !removidos.has(p.produto_id))
      .map((p) => ({
        produto_id: p.produto_id,
        preco_unit: indisp[p.produto_id] ? "" : ler(`preco_${p.produto_id}`),
        disponivel: !indisp[p.produto_id],
        foto_url: fotos[p.produto_id] ?? "",
        embalagem: emb[p.produto_id] ?? "",
        observacao: obs[p.produto_id] ?? "",
        st_inclusa: p.tem_st ? String(!!stInc[p.produto_id]) : "",
        st_pct: p.tem_st ? (stPct[p.produto_id] ?? "").replace(",", ".").trim() : "",
      }));
  }

  // Auto-save (rascunho): grava sozinho ~1,2s depois de qualquer mudança,
  // pra não perder nada se o fornecedor sair e voltar.
  function agendarSalvar() {
    if (fechada) return;
    setSalvo("salvando");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      await salvarPrecosPublico(token, {
        precos: montarPrecos(),
        ...dados,
        pedido_minimo: dados.pedido_minimo.replace(",", ".").trim(),
        rascunho: true,
      });
      setSalvo("ok");
    }, 1200);
  }

  async function enviarFoto(produtoId: string, file: File) {
    setSubindo((s) => ({ ...s, [produtoId]: true }));
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${token}/${produtoId}-${Date.now()}.${ext}`;
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

  function enviar() {
    // Valida: cada item disponível precisa de preço e de embalagem/unidade.
    const faltando: string[] = [];
    for (const p of produtos) {
      if (removidos.has(p.produto_id) || indisp[p.produto_id]) continue;
      if (!ler(`preco_${p.produto_id}`)) faltando.push(`preço de ${p.nome}`);
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
      const r = await salvarPrecosPublico(token, {
        precos: montarPrecos(),
        ...dados,
        pedido_minimo: dados.pedido_minimo.replace(",", ".").trim(),
      });
      setMsg(
        r?.ok
          ? "Preços enviados! Obrigado. Você pode revisar e reenviar se quiser."
          : (r?.erro ?? "Não foi possível enviar. Tente de novo."),
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
      setTimeout(() => setMsg(null), 6000);
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
    await removerItemPublico(token, produtoId);
  }

  const visiveis = produtos.filter((p) => !removidos.has(p.produto_id));

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

        <p className="mt-4 text-sm text-zinc-500">
          Informe o <b>preço</b> e a <b>unidade/embalagem</b> (fardo, caixa, unidade...) de cada
          item. Se estiver <b>em falta</b>, marque o botão. O que você preencher é{" "}
          <b>salvo automaticamente</b> — pode sair e voltar sem perder.
        </p>

        <form ref={formRef} className="mt-4 space-y-3">
          {visiveis.map((p) => {
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
                      className="shrink-0 text-xs text-zinc-400 hover:text-red-600"
                    >
                      Não trabalho
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
                    defaultValue={p.preco_unit != null ? p.preco_unit : ""}
                    onChange={agendarSalvar}
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

                {/* Embalagem / unidade de venda */}
                {!emFalta && (
                  <div className="mt-2">
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

          {/* Rodapé: condições do fornecedor */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Condições do pedido
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-zinc-500">
                Entrega prevista
                <input
                  type="date"
                  value={dados.prazo_entrega}
                  disabled={fechada}
                  onChange={(e) => {
                    setDados((d) => ({ ...d, prazo_entrega: e.target.value }));
                    agendarSalvar();
                  }}
                  className={`${campo} mt-1 w-full`}
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
