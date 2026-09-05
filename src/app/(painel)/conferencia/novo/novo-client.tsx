"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { criarPedidoManual } from "../actions";
import { Combobox } from "@/components/combobox";
import { hojeSP } from "@/lib/etiqueta-vencimentos";

type Prod = { id: string; nome: string; unidade: string; preco_referencia: number | null };
type Item = { produto_id: string; nome: string; unidade: string; qtd: string; preco: string };

const campo =
  "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";
const num = (s: string) => Number(String(s).replace(",", ".")) || 0;

type Forn = { id: string; nome: string; whatsapp: string | null };

export function NovoPedidoClient({
  fornecedores,
  produtos,
}: {
  fornecedores: Forn[];
  produtos: Prod[];
}) {
  const [fornecedorId, setFornecedorId] = useState("");
  const [data, setData] = useState(() => hojeSP());
  const [itens, setItens] = useState<Item[]>([]);
  const [busca, setBusca] = useState("");
  const [salvando, start] = useTransition();

  const encontrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return [];
    const jaTem = new Set(itens.map((i) => i.produto_id));
    return produtos
      .filter((p) => p.nome.toLowerCase().includes(q) && !jaTem.has(p.id))
      .slice(0, 20);
  }, [busca, produtos, itens]);

  function adicionar(p: Prod) {
    setItens((s) => [
      ...s,
      {
        produto_id: p.id,
        nome: p.nome,
        unidade: p.unidade,
        qtd: "1",
        preco: p.preco_referencia != null ? String(p.preco_referencia).replace(".", ",") : "",
      },
    ]);
    setBusca("");
  }
  function alterar(idx: number, campo: "qtd" | "preco", v: string) {
    setItens((s) => s.map((i, k) => (k === idx ? { ...i, [campo]: v } : i)));
  }
  function remover(idx: number) {
    setItens((s) => s.filter((_, k) => k !== idx));
  }

  const total = itens.reduce((s, i) => s + num(i.qtd) * num(i.preco), 0);

  const forn = fornecedores.find((f) => f.id === fornecedorId);
  const zap = (forn?.whatsapp ?? "").replace(/\D/g, "");
  // Garante o DDI 55 (Brasil) quando o número vem só com DDD.
  const zapFull = zap ? (zap.startsWith("55") ? zap : `55${zap}`) : "";

  function enviarWhats() {
    if (!zapFull || itens.length === 0) return;
    const linhas = itens.map(
      (i) => `- ${i.qtd} ${i.unidade} ${i.nome}`,
    );
    const msg =
      `Olá! Pedido do Restaurante Brasa:\n\n${linhas.join("\n")}\n\n` +
      `Data prevista: ${data.split("-").reverse().join("/")}\nObrigado!`;
    window.open(`https://wa.me/${zapFull}?text=${encodeURIComponent(msg)}`, "_blank");
  }

  function criar() {
    start(async () => {
      await criarPedidoManual(
        fornecedorId,
        data,
        itens.map((i) => ({
          produto_id: i.produto_id,
          qtd: num(i.qtd),
          preco_unit: i.preco.trim() ? num(i.preco) : null,
        })),
      );
    });
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <Link href="/conferencia" className="text-sm text-zinc-500 hover:text-orange-600">
        ← Conferência
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
        Novo pedido manual
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        Para compras feitas direto, sem passar por cotação. Depois de criar, você confere
        (podendo ajustar quantidades e valores).
      </p>

      <div className="mt-5 flex flex-wrap gap-3">
        <div className="min-w-56 flex-1">
          <label className="mb-1 block text-xs text-zinc-500">Fornecedor</label>
          <Combobox
            options={fornecedores.map((f) => ({ value: f.id, label: f.nome }))}
            value={fornecedorId}
            onChange={setFornecedorId}
            placeholder="Buscar fornecedor..."
            className={`${campo} w-full`}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Data</label>
          <input
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            className={campo}
          />
        </div>
      </div>

      {/* Buscar e adicionar produtos */}
      <div className="mt-4">
        <label className="mb-1 block text-xs text-zinc-500">Adicionar produto</label>
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Digite o nome do produto..."
          className={`${campo} w-full`}
        />
        {encontrados.length > 0 && (
          <div className="mt-1 max-h-52 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            {encontrados.map((p) => (
              <button
                key={p.id}
                onClick={() => adicionar(p)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-orange-50 dark:hover:bg-orange-950/30"
              >
                <span className="text-zinc-800 dark:text-zinc-200">{p.nome}</span>
                <span className="text-xs text-zinc-400">{p.unidade}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Itens do pedido */}
      {itens.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-400 dark:bg-zinc-900">
              <tr>
                <th className="px-3 py-2">Produto</th>
                <th className="px-3 py-2 text-right">Qtd</th>
                <th className="px-3 py-2 text-right">Preço un.</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {itens.map((i, idx) => (
                <tr key={i.produto_id} className="bg-white dark:bg-zinc-950">
                  <td className="px-3 py-2 text-zinc-800 dark:text-zinc-200">
                    {i.nome} <span className="text-xs text-zinc-400">{i.unidade}</span>
                  </td>
                  <td className="px-2 py-1 text-right">
                    <input
                      inputMode="decimal"
                      value={i.qtd}
                      onChange={(e) => alterar(idx, "qtd", e.target.value)}
                      className="w-16 rounded border border-zinc-300 bg-white px-2 py-1 text-right dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                    />
                  </td>
                  <td className="px-2 py-1 text-right">
                    <input
                      inputMode="decimal"
                      value={i.preco}
                      placeholder="—"
                      onChange={(e) => alterar(idx, "preco", e.target.value)}
                      className="w-20 rounded border border-zinc-300 bg-white px-2 py-1 text-right dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                    />
                  </td>
                  <td className="px-3 py-2 text-right text-zinc-600 dark:text-zinc-300">
                    {(num(i.qtd) * num(i.preco)).toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}
                  </td>
                  <td className="px-2 py-1 text-right">
                    <button
                      onClick={() => remover(idx)}
                      className="text-zinc-300 hover:text-red-600 dark:text-zinc-600"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
              <tr className="bg-zinc-50 dark:bg-zinc-900">
                <td className="px-3 py-2 font-semibold" colSpan={3}>
                  Total
                </td>
                <td className="px-3 py-2 text-right font-semibold">
                  {total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button
          onClick={criar}
          disabled={salvando || !fornecedorId || itens.length === 0}
          className="rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
        >
          {salvando ? "Criando..." : "Criar pedido e conferir →"}
        </button>
        <button
          onClick={enviarWhats}
          disabled={itens.length === 0 || !zapFull}
          title={
            !fornecedorId
              ? "Escolha o fornecedor"
              : !zapFull
                ? "Este fornecedor não tem WhatsApp cadastrado"
                : "Enviar o pedido no WhatsApp do fornecedor"
          }
          className="rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
        >
          📱 Enviar no WhatsApp
        </button>
      </div>
      {fornecedorId && !zapFull && (
        <p className="mt-2 text-xs text-amber-600">
          O fornecedor <b>{forn?.nome}</b> não tem WhatsApp cadastrado — adicione em
          Fornecedores para poder enviar o pedido.
        </p>
      )}
    </div>
  );
}
