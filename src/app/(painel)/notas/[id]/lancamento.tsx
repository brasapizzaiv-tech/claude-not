"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  lancarNota,
  estornarNota,
  vincularFornecedorNota,
  definirTipoNota,
  definirCategoriaNota,
  criarEVincularFornecedor,
} from "../actions";

const campo =
  "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

type Cat = { id: string; tipo: string; grupo: string; nome: string };

export function LancamentoNota({
  notaId,
  situacao,
  fornecedorId,
  fornecedorNome,
  emitCnpj,
  emitNome,
  vencimento,
  competenciaInicial,
  fornecedores,
  tipo,
  dreCategoriaId,
  categorias,
}: {
  notaId: string;
  situacao: string;
  fornecedorId: string | null;
  fornecedorNome: string | null;
  emitCnpj: string | null;
  emitNome: string | null;
  vencimento: string | null;
  competenciaInicial: string;
  fornecedores: { id: string; nome: string }[];
  tipo: string;
  dreCategoriaId: string | null;
  categorias: Cat[];
}) {
  const router = useRouter();
  const [proc, start] = useTransition();
  const [venc, setVenc] = useState(vencimento ?? "");
  const [comp, setComp] = useState(competenciaInicial);
  const [fornSel, setFornSel] = useState(fornecedorId ?? "");
  const [trocando, setTrocando] = useState(false);
  const [modoNovo, setModoNovo] = useState(false);
  const [novoNome, setNovoNome] = useState(emitNome ?? "");
  const [catSel, setCatSel] = useState(dreCategoriaId ?? "");

  const lancada = situacao === "lancada";
  const ehServico = tipo === "servico";

  function mudarTipo(t: string) {
    if (t === tipo || lancada) return;
    start(async () => {
      await definirTipoNota(notaId, t);
      router.refresh();
    });
  }
  function mudarCategoria(id: string) {
    setCatSel(id);
    start(async () => {
      await definirCategoriaNota(notaId, id || null);
    });
  }
  function vincularForn() {
    start(async () => {
      await vincularFornecedorNota(notaId, fornSel || null);
      setTrocando(false);
      router.refresh();
    });
  }
  function cadastrarForn() {
    if (!novoNome.trim()) return;
    start(async () => {
      await criarEVincularFornecedor(notaId, novoNome.trim(), emitCnpj);
      setModoNovo(false);
      router.refresh();
    });
  }
  function lancar() {
    start(async () => {
      await lancarNota(notaId, { vencimento: venc || null, competencia: comp || null });
      router.refresh();
    });
  }
  function estornar() {
    start(async () => {
      await estornarNota(notaId);
      router.refresh();
    });
  }

  const btnTipo = (ativo: boolean) =>
    `rounded-lg px-4 py-2 text-sm font-medium ${
      ativo
        ? "bg-orange-500 text-white"
        : "border border-zinc-300 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
    }`;

  const faltaCategoria = ehServico && !catSel;

  return (
    <div className="mt-4 space-y-4 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
      <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
        Lançar no financeiro
      </h2>

      {/* Tipo da nota */}
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Tipo da nota</label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => mudarTipo("mercadoria")}
            disabled={proc || lancada}
            className={btnTipo(!ehServico)}
          >
            🛒 Mercadoria
          </button>
          <button
            type="button"
            onClick={() => mudarTipo("servico")}
            disabled={proc || lancada}
            className={btnTipo(ehServico)}
          >
            🧾 Serviço
          </button>
        </div>
        {ehServico && (
          <p className="mt-1 text-[11px] text-zinc-400">
            Nota de serviço: lança o valor total na categoria de despesa
            escolhida (sem CMV por produto).
          </p>
        )}
      </div>

      {/* Fornecedor */}
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Fornecedor</label>
        {fornecedorId && !trocando ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg bg-green-100 px-3 py-1.5 text-sm font-medium text-green-700 dark:bg-green-950 dark:text-green-300">
              ✓ {fornecedorNome}
            </span>
            <button
              onClick={() => setTrocando(true)}
              className="text-xs text-zinc-400 hover:text-orange-600"
            >
              trocar
            </button>
          </div>
        ) : modoNovo ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="w-full text-xs text-zinc-500">
              Novo fornecedor com o CNPJ da nota ({emitCnpj || "sem CNPJ"}):
            </p>
            <input
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              placeholder="Nome do fornecedor"
              className={`${campo} min-w-56 flex-1`}
            />
            <button
              onClick={cadastrarForn}
              disabled={proc || !novoNome.trim()}
              className="rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
            >
              Cadastrar e vincular
            </button>
            <button
              onClick={() => setModoNovo(false)}
              className="text-xs text-zinc-400 hover:text-zinc-600"
            >
              cancelar
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {!fornecedorId && (
              <p className="w-full rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                Não reconheci o fornecedor pelo CNPJ ({emitCnpj || "?"}). Escolha
                abaixo, ou cadastre um novo.
              </p>
            )}
            <select
              value={fornSel}
              onChange={(e) => setFornSel(e.target.value)}
              className={`${campo} min-w-56 flex-1`}
            >
              <option value="">Selecione o fornecedor...</option>
              {fornecedores.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </select>
            <button
              onClick={vincularForn}
              disabled={proc}
              className="rounded-lg bg-zinc-800 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-900 disabled:opacity-60 dark:bg-zinc-700"
            >
              Vincular
            </button>
            <button
              onClick={() => {
                setNovoNome(emitNome ?? "");
                setModoNovo(true);
              }}
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              ➕ Cadastrar novo
            </button>
          </div>
        )}
      </div>

      {/* Categoria da despesa (só serviço) */}
      {ehServico && (
        <div>
          <label className="mb-1 block text-xs text-zinc-500">
            Categoria da despesa (DRE)
          </label>
          <select
            value={catSel}
            onChange={(e) => mudarCategoria(e.target.value)}
            disabled={lancada}
            className={`${campo} w-full`}
          >
            <option value="">Selecione a categoria...</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.grupo} — {c.nome}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Vencimento + Competência */}
      <div className="flex flex-wrap gap-3">
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Vencimento do boleto</label>
          <input
            type="date"
            value={venc}
            disabled={lancada}
            onChange={(e) => setVenc(e.target.value)}
            className={campo}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Competência (mês)</label>
          <input
            type="month"
            value={comp}
            disabled={lancada}
            onChange={(e) => setComp(e.target.value)}
            className={campo}
          />
        </div>
      </div>

      {/* Ação */}
      <div className="flex items-center gap-3 border-t border-zinc-100 pt-3 dark:border-zinc-800">
        {lancada ? (
          <>
            <span className="text-sm font-medium text-green-600">✓ Lançada no financeiro</span>
            <button
              onClick={estornar}
              disabled={proc}
              className="text-sm text-zinc-400 hover:text-amber-600 disabled:opacity-60"
            >
              Estornar
            </button>
          </>
        ) : (
          <button
            onClick={lancar}
            disabled={proc || !fornecedorId || faltaCategoria}
            className="rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
            title={
              !fornecedorId
                ? "Vincule o fornecedor primeiro"
                : faltaCategoria
                  ? "Escolha a categoria da despesa"
                  : ""
            }
          >
            {proc ? "Lançando..." : "Lançar no financeiro"}
          </button>
        )}
      </div>
      {!ehServico && (
        <p className="text-[11px] text-zinc-400">
          Dica: vincule cada item ao produto certo (abaixo) para o CMV cair na
          categoria do DRE. Sem vínculo, vai tudo para “Compras”.
        </p>
      )}
    </div>
  );
}
