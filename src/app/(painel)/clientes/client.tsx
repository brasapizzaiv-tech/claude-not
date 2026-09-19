"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { salvarCliente, excluirCliente } from "./actions";

export type Cliente = {
  id: string;
  nome: string;
  cpf_cnpj: string | null;
  limite_credito: number | null;
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
  "w-full min-h-11 rounded-controle border border-borda-forte bg-transparent px-3 text-sm text-texto outline-none focus:border-primaria";

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
      <label className="mb-1 block text-xs text-texto-suave">{label}</label>
      <input name={nome} defaultValue={def ?? ""} placeholder={ph} className={campo} />
    </div>
  );
}

export function ClientesClient({ clientes }: { clientes: Cliente[] }) {
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<Cliente | null>(null);
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, start] = useTransition();
  const router = useRouter();
  // Fecha a janela só depois de salvar de verdade (antes ela ficava aberta e
  // parecia que não tinha salvado — e o cliente era cadastrado em dobro).
  function enviar(fd: FormData) {
    setErro(null);
    start(async () => {
      const r = await salvarCliente(fd);
      if (!r || !r.ok) { setErro(r?.mensagem ?? "Não consegui salvar."); return; }
      setAberto(false); setEditando(null);
      router.refresh();
    });
  }

  const q = busca.trim().toLowerCase();
  const filtrados = q
    ? clientes.filter(
        (c) => c.nome.toLowerCase().includes(q) || (c.cpf_cnpj ?? "").includes(q),
      )
    : clientes;

  return (
    <div className="mx-auto max-w-4xl p-6">
      <Link href="/dashboard" className="text-sm text-texto-suave hover:text-orange-600">← Início</Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-numero text-2xl font-semibold tracking-apertada text-texto">Clientes</h1>
          <p className="mt-1 text-sm text-texto-suave">Para emitir NF-e com o cliente (CNPJ/CPF).</p>
        </div>
        <button
          onClick={() => {
            setEditando(null);
            setAberto(true);
          }}
          className="min-h-11 rounded-controle bg-texto px-4 text-sm font-semibold text-fundo transition hover:opacity-90"
        >
          + Novo cliente
        </button>
      </div>

      <input
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar por nome ou CNPJ/CPF..."
        className={`${campo} mt-4 max-w-md`}
      />

      <div className="mt-4 overflow-hidden rounded-cartao bg-painel-cartao">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-borda">
            {filtrados.map((c) => (
              <tr key={c.id} className="">
                <td className="px-4 py-3">
                  <div className="font-medium text-texto">{c.nome}</div>
                  <div className="text-xs text-texto-fraco">
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
                    <button className="text-texto-fraco hover:text-red-600">Remover</button>
                  </form>
                </td>
              </tr>
            ))}
            {filtrados.length === 0 && (
              <tr>
                <td className="px-4 py-8 text-center text-texto-fraco">Nenhum cliente.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {aberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            action={enviar}
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-cartao bg-painel-cartao p-5"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-texto">
                {editando ? "Editar cliente" : "Novo cliente"}
              </h2>
              <button type="button" onClick={() => setAberto(false)} className="text-texto-fraco hover:text-texto-suave">✕</button>
            </div>
            {editando && <input type="hidden" name="id" value={editando.id} />}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs text-texto-suave">Nome / razão social *</label>
                <input name="nome" defaultValue={editando?.nome ?? ""} required className={campo} />
              </div>
              <F nome="cpf_cnpj" label="CNPJ / CPF" def={editando?.cpf_cnpj} />
              <label className="block">
                <span className="mb-1 block text-xs text-texto-suave">Limite de crédito (fiado)</span>
                <input
                  name="limite_credito"
                  defaultValue={editando?.limite_credito != null ? String(editando.limite_credito).replace(".", ",") : ""}
                  placeholder="vazio = sem limite"
                  inputMode="decimal"
                  className={campo}
                />
              </label>
              <F nome="ie" label="Inscrição Estadual" def={editando?.ie} />
              <F nome="email" label="E-mail" def={editando?.email} />
              <F nome="telefone" label="Telefone" def={editando?.telefone} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <F nome="cep" label="CEP" def={editando?.cep} />
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs text-texto-suave">Logradouro</label>
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
              <button type="button" onClick={() => setAberto(false)} className="rounded-controle border border-borda-forte px-4 py-2 text-sm">
                Cancelar
              </button>
              <button disabled={salvando} className="rounded-controle bg-orange-500 px-5 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50">
                {salvando ? "Salvando..." : "Salvar"}
              </button>
            </div>
            {erro && <p className="mt-2 text-sm text-red-600">{erro}</p>}
          </form>
        </div>
      )}
    </div>
  );
}
