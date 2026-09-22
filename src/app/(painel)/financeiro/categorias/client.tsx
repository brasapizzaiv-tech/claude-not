"use client";

import { useMemo, useState, useTransition } from "react";
import { Icone } from "@/components/icone";
import { Enviar } from "@/components/enviar";
import { confirmar, avisar } from "@/components/dialogo";
import {
  alternarCategoriaDre,
  criarCategoriaDre,
  excluirCategoriaDre,
  renomearCategoriaDre,
} from "./actions";

export type CategoriaDre = {
  id: string;
  tipo: string;
  grupo: string;
  nome: string;
  ativo: boolean;
  /** Quantas contas lançadas usam esta categoria. */
  usos: number;
  /** Alguma das seis tabelas aponta pra ela — então não dá pra apagar. */
  presa?: boolean;
  /** O código procura esta categoria pelo NOME: renomear quebra automação. */
  doSistema?: boolean;
};

// Os lugares do DRE, na ordem em que aparecem no relatório. O nome curto é o
// que está no banco; o nome longo é o que a pessoa lê — ninguém sabe de cor o
// que "cmo" ou "deducao" quer dizer.
const LUGARES: { tipo: string; rotulo: string; ajuda: string }[] = [
  { tipo: "receita", rotulo: "Receita", ajuda: "o que entra" },
  { tipo: "deducao", rotulo: "Deduções", ajuda: "descontos sobre a venda" },
  { tipo: "cmv", rotulo: "CMV", ajuda: "o que vira prato: mercadoria" },
  { tipo: "cmo", rotulo: "CMO variável", ajuda: "mão de obra que varia com o movimento" },
  { tipo: "tarifa", rotulo: "Tarifas", ajuda: "cartão, marketplace" },
  { tipo: "despesa_fixa", rotulo: "Despesa fixa", ajuda: "paga todo mês, venda ou não" },
  { tipo: "financeira", rotulo: "Financeiras", ajuda: "juros, empréstimo" },
  { tipo: "imposto", rotulo: "Impostos", ajuda: "" },
  { tipo: "nao_operacional", rotulo: "Não operacional", ajuda: "fora do dia a dia do restaurante" },
];

export function CategoriasDreClient({ linhas }: { linhas: CategoriaDre[] }) {
  const [salvando, comSalvar] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [mostrarInativas, setMostrarInativas] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState({ nome: "", grupo: "" });

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return linhas.filter(
      (c) =>
        (mostrarInativas || c.ativo) &&
        (!q || c.nome.toLowerCase().includes(q) || c.grupo.toLowerCase().includes(q)),
    );
  }, [linhas, busca, mostrarInativas]);

  // Os grupos que já existem, pra sugerir na hora de criar em vez de a pessoa
  // ter que lembrar como escreveu "Utilidades Públicas".
  const gruposExistentes = useMemo(
    () => [...new Set(linhas.map((c) => c.grupo))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [linhas],
  );

  const inativas = linhas.filter((c) => !c.ativo).length;

  function aviso(texto: string) {
    setMsg(texto);
    setTimeout(() => setMsg(null), 6000);
  }

  async function salvarNome(c: CategoriaDre) {
    const nome = rascunho.nome.trim();
    const grupo = rascunho.grupo.trim();
    if (!nome || !grupo) return;
    if (nome === c.nome && grupo === c.grupo) { setEditando(null); return; }
    // O código procura esta categoria pelo nome: trocar o nome desliga a
    // automação sem avisar ninguém. Melhor perguntar.
    if (c.doSistema && nome !== c.nome) {
      const ok = await confirmar(
        `"${c.nome}" é procurada pelo NOME por uma parte do sistema (fechamento de caixa, conferência ou diaristas). Renomear desliga essa ligação em silêncio. Renomear mesmo assim?`,
        { perigo: true },
      );
      if (!ok) return;
    }
    comSalvar(async () => {
      const r = await renomearCategoriaDre(c.id, nome, grupo);
      if (!r.ok) aviso(r.erro);
      setEditando(null);
    });
  }

  async function apagar(c: CategoriaDre) {
    if (!await confirmar(`Apagar a categoria "${c.nome}"? Ela não tem nenhuma conta lançada.`, { perigo: true })) return;
    comSalvar(async () => {
      const r = await excluirCategoriaDre(c.id);
      if (!r.ok) void avisar(r.erro);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ---------- Criar ---------- */}
      <form
        action={async (fd) => {
          const r = await criarCategoriaDre(fd);
          if (!r.ok) aviso(r.erro);
          else (document.getElementById("form-nova-cat") as HTMLFormElement | null)?.reset();
        }}
        id="form-nova-cat"
        className="flex flex-wrap items-end gap-3 rounded-cartao bg-painel-cartao p-4"
      >
        <div className="min-w-56 flex-1">
          <label className="mb-1 block text-xs text-texto-suave" htmlFor="nova-nome">Nova categoria</label>
          <input
            id="nova-nome"
            name="nome"
            required
            placeholder="Ex.: Lavanderia"
            className="min-h-11 w-full rounded-controle border border-borda-forte bg-transparent px-3 text-sm text-texto focus:border-primaria"
          />
        </div>
        <div className="min-w-48">
          <label className="mb-1 block text-xs text-texto-suave" htmlFor="nova-tipo">Onde entra no DRE</label>
          <select
            id="nova-tipo"
            name="tipo"
            required
            defaultValue="despesa_fixa"
            className="min-h-11 w-full rounded-controle border border-borda-forte bg-transparent px-3 text-sm text-texto focus:border-primaria"
          >
            {LUGARES.map((l) => (
              <option key={l.tipo} value={l.tipo}>
                {l.rotulo}{l.ajuda ? ` — ${l.ajuda}` : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-48">
          <label className="mb-1 block text-xs text-texto-suave" htmlFor="nova-grupo">Grupo</label>
          {/* Lista de sugestões: aceita um grupo que já existe ou um novo. */}
          <input
            id="nova-grupo"
            name="grupo"
            required
            list="grupos-dre"
            placeholder="Ex.: Administrativas"
            className="min-h-11 w-full rounded-controle border border-borda-forte bg-transparent px-3 text-sm text-texto focus:border-primaria"
          />
          <datalist id="grupos-dre">
            {gruposExistentes.map((g) => <option key={g} value={g} />)}
          </datalist>
        </div>
        <Enviar className="min-h-11 rounded-controle bg-texto px-4 text-sm font-semibold text-fundo transition hover:opacity-90">
          <Icone nome="novo" tamanho={16} /> Criar
        </Enviar>
      </form>

      {msg && (
        <p className="rounded-controle bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-950 dark:text-amber-300">
          {msg}
        </p>
      )}

      {/* ---------- Buscar ---------- */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar categoria ou grupo..."
          className="min-h-11 w-full max-w-md rounded-controle border border-borda-forte bg-transparent px-3 text-sm text-texto focus:border-primaria"
        />
        {inativas > 0 && (
          <label className="flex items-center gap-2 text-sm text-texto-suave">
            <input
              type="checkbox"
              checked={mostrarInativas}
              onChange={(e) => setMostrarInativas(e.target.checked)}
              className="h-4 w-4"
            />
            mostrar as {inativas} desativada(s)
          </label>
        )}
        <span className="ml-auto text-xs text-texto-fraco">{visiveis.length} de {linhas.length}</span>
      </div>

      {/* ---------- Lista ---------- */}
      {LUGARES.map((lugar) => {
        const doLugar = visiveis.filter((c) => c.tipo === lugar.tipo);
        if (doLugar.length === 0) return null;
        const grupos = [...new Set(doLugar.map((c) => c.grupo))];
        return (
          <section key={lugar.tipo}>
            <h2 className="mb-2 text-sm font-semibold text-texto">
              {lugar.rotulo}
              {lugar.ajuda && <span className="ml-2 font-normal text-texto-fraco">{lugar.ajuda}</span>}
            </h2>
            <div className="overflow-hidden rounded-cartao bg-painel-cartao">
              {grupos.map((g) => (
                <div key={g}>
                  <p className="border-b border-borda bg-superficie-suave px-4 py-1.5 text-xs font-medium text-texto-suave">
                    {g}
                  </p>
                  <ul className="divide-y divide-borda">
                    {doLugar.filter((c) => c.grupo === g).map((c) => (
                      <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-2">
                        {editando === c.id ? (
                          <>
                            <input
                              autoFocus
                              value={rascunho.nome}
                              onChange={(e) => setRascunho((r) => ({ ...r, nome: e.target.value }))}
                              onKeyDown={(e) => { if (e.key === "Enter") salvarNome(c); if (e.key === "Escape") setEditando(null); }}
                              className="min-h-9 flex-1 rounded-controle border border-primaria bg-transparent px-2 text-sm text-texto"
                            />
                            <input
                              value={rascunho.grupo}
                              onChange={(e) => setRascunho((r) => ({ ...r, grupo: e.target.value }))}
                              onKeyDown={(e) => { if (e.key === "Enter") salvarNome(c); if (e.key === "Escape") setEditando(null); }}
                              list="grupos-dre"
                              className="min-h-9 w-44 rounded-controle border border-borda-forte bg-transparent px-2 text-sm text-texto"
                            />
                            <button
                              onClick={() => salvarNome(c)}
                              disabled={salvando}
                              className="min-h-9 rounded-controle bg-texto px-3 text-xs font-semibold text-fundo"
                            >
                              Salvar
                            </button>
                            <button onClick={() => setEditando(null)} className="text-xs text-texto-fraco hover:underline">
                              cancelar
                            </button>
                          </>
                        ) : (
                          <>
                            <span className={`flex-1 text-sm ${c.ativo ? "text-texto" : "text-texto-fraco line-through"}`}>
                              {c.nome}
                            </span>
                            <span className="text-xs text-texto-fraco">
                              {c.usos > 0 ? `${c.usos} conta(s)` : c.presa ? "em uso" : "sem uso"}
                            </span>
                            {c.doSistema && (
                              <span
                                className="rounded-controle bg-amber-100 px-1.5 py-0.5 text-mini font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                                title="O sistema procura esta categoria pelo nome (fechamento de caixa, conferência, diaristas). Renomear quebra essa ligação."
                              >
                                usada pelo sistema
                              </span>
                            )}
                            <button
                              onClick={() => { setEditando(c.id); setRascunho({ nome: c.nome, grupo: c.grupo }); }}
                              className="text-xs text-texto-suave hover:text-texto hover:underline"
                            >
                              renomear
                            </button>
                            <button
                              onClick={() => comSalvar(async () => { await alternarCategoriaDre(c.id, !c.ativo); })}
                              disabled={salvando}
                              className="text-xs text-texto-suave hover:text-texto hover:underline"
                            >
                              {c.ativo ? "desativar" : "reativar"}
                            </button>
                            {/* Apagar só aparece quando não há nada preso. A
                                regra de verdade está no servidor; aqui o botão
                                some pra não oferecer o que vai ser recusado. */}
                            {c.usos === 0 && !c.presa && !c.doSistema && (
                              <button
                                onClick={() => apagar(c)}
                                disabled={salvando}
                                className="text-xs text-texto-fraco hover:text-red-600 hover:underline"
                              >
                                apagar
                              </button>
                            )}
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
