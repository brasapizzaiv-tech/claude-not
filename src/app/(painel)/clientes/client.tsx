"use client";

import { useState } from "react";
import Link from "next/link";
import { salvarCliente, excluirCliente } from "./actions";

export type Cliente = {
  id: string;
  nome: string;
  cpf_cnpj: string | null;
  ie: string | null;
  email: string | null;
  telefone: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  municipio: string | null;
  uf: string | null;
  cod_municipio: string | null;
};

const campo =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

function F({
  nome,
  label,
  def,
  ph,
}: {
  nome: string;
  label: string;
  def?: string | null;
  ph?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs text-zinc-500">{label}</label>
      <input name={nome} defaultValue={def ?? ""} placeholder={ph} className={campo} />
    </div>
  );
}

export function ClientesClient({ clientes }: { clientes: Cliente[] }) {
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<Cliente | null>(null);
  const [aberto, setAberto] = useState(false);

  const q = busca.trim().toLowerCase();
  const filtrados = q
    ? clientes.filter(
        (c) => c.nome.toLowerCase().includes(q) || (c.cpf_cnpj ?? "").includes(q),
      )
    : clientes;

  return (
    <div className="mx-auto max-w-4xl p-6">
      <Link href="/dashboard" className="text-sm text-zinc-500 hover:text-orange-600">← Início</Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Clientes</h1>
          <p className="mt-1 text-sm text-zinc-500">Para emitir NF-e com o cliente (CNPJ/CPF).</p>
        </div>
        <button
          onClick={() => {
            setEditando(null);
            setAberto(true);
          }}
          className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
        >
          + Novo cliente
        </button>
      </div>

      <input
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="🔎 Buscar por nome ou CNPJ/CPF..."
        className={`${campo} mt-4 max-w-md`}
      />

      <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {filtrados.map((c) => (
              <tr key={c.id} className="bg-white dark:bg-zinc-950">
                <td className="px-4 py-3">
                  <div className="font-medium text-zinc-900 dark:text-zinc-100">{c.nome}</div>
                  <div className="text-xs text-zinc-400">
                    {[c.cpf_cnpj, c.municipio, c.uf].filter(Boolean).join(" · ")}
                  </div>
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button
                    onClick={() => {
                      setEditando(c);
                      setAberto(true);
                    }}
                    className="mr-3 text-orange-600 hover:underline"
                  >
                    Editar
                  </button>
                  <form action={excluirCliente} className="inline">
                    <input type="hidden" name="id" value={c.id} />
                    <button className="text-zinc-400 hover:text-red-600">Remover</button>
                  </form>
                </td>
              </tr>
            ))}
            {filtrados.length === 0 && (
              <tr>
                <td className="px-4 py-8 text-center text-zinc-400">Nenhum cliente.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {aberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            action={salvarCliente}
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 dark:bg-zinc-950"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
                {editando ? "Editar cliente" : "Novo cliente"}
              </h2>
              <button type="button" onClick={() => setAberto(false)} className="text-zinc-400 hover:text-zinc-700">✕</button>
            </div>
            {editando && <input type="hidden" name="id" value={editando.id} />}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs text-zinc-500">Nome / razão social *</label>
                <input name="nome" defaultValue={editando?.nome ?? ""} required className={campo} />
              </div>
              <F nome="cpf_cnpj" label="CNPJ / CPF" def={editando?.cpf_cnpj} />
              <F nome="ie" label="Inscrição Estadual" def={editando?.ie} />
              <F nome="email" label="E-mail" def={editando?.email} />
              <F nome="telefone" label="Telefone" def={editando?.telefone} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <F nome="cep" label="CEP" def={editando?.cep} />
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs text-zinc-500">Logradouro</label>
                <input name="logradouro" defaultValue={editando?.logradouro ?? ""} className={campo} />
              </div>
              <F nome="numero" label="Número" def={editando?.numero} />
              <F nome="complemento" label="Complemento" def={editando?.complemento} />
              <F nome="bairro" label="Bairro" def={editando?.bairro} />
              <F nome="municipio" label="Município" def={editando?.municipio} />
              <F nome="uf" label="UF" def={editando?.uf} ph="RS" />
              <F nome="cod_municipio" label="Cód. IBGE" def={editando?.cod_municipio} />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setAberto(false)} className="rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700">
                Cancelar
              </button>
              <button className="rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-white hover:bg-orange-600">
                Salvar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
