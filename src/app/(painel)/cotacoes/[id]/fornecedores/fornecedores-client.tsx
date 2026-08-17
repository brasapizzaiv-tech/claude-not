"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  convidarFornecedor,
  convidarVarios,
  removerFornecedor,
} from "../../actions";

export type FornecedorLinha = {
  id: string;
  nome: string;
  whatsapp: string | null;
  cobertura: number;
  convidado: boolean;
  token: string | null;
  respondido: boolean;
};

const MSG_PADRAO =
  "Olá! Segue o link para você nos passar os preços da nossa cotação ({itens} itens): {link}";

export function FornecedoresClient({
  cotacaoId,
  totalItens,
  linhas,
}: {
  cotacaoId: string;
  totalItens: number;
  linhas: FornecedorLinha[];
}) {
  const router = useRouter();
  const [origin, setOrigin] = useState("");
  const [convidandoTodos, setConvidandoTodos] = useState(false);
  const [template, setTemplate] = useState<string>(() => {
    if (typeof window === "undefined") return MSG_PADRAO;
    try {
      return localStorage.getItem("cot_msg_template") || MSG_PADRAO;
    } catch {
      return MSG_PADRAO;
    }
  });
  const [enviados, setEnviados] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      return new Set(JSON.parse(localStorage.getItem(`cot_env_${cotacaoId}`) || "[]"));
    } catch {
      return new Set();
    }
  });

  useMemo(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);

  function salvarTemplate(v: string) {
    setTemplate(v);
    try {
      localStorage.setItem("cot_msg_template", v);
    } catch {}
  }
  function marcarEnviado(id: string) {
    setEnviados((s) => {
      const n = new Set(s).add(id);
      try {
        localStorage.setItem(`cot_env_${cotacaoId}`, JSON.stringify([...n]));
      } catch {}
      return n;
    });
  }
  function resetarEnviados() {
    setEnviados(new Set());
    try {
      localStorage.removeItem(`cot_env_${cotacaoId}`);
    } catch {}
  }

  async function convidar(fornecedorId: string) {
    await convidarFornecedor(cotacaoId, fornecedorId);
    router.refresh();
  }
  async function convidarTodos() {
    setConvidandoTodos(true);
    await convidarVarios(
      cotacaoId,
      linhas.filter((l) => !l.convidado).map((l) => l.id),
    );
    router.refresh();
    setConvidandoTodos(false);
  }
  async function remover(fornecedorId: string) {
    await removerFornecedor(cotacaoId, fornecedorId);
    router.refresh();
  }

  const convidados = linhas.filter((l) => l.convidado);
  const naoConvidados = linhas.filter((l) => !l.convidado);

  function waHref(l: FornecedorLinha) {
    const zap = (l.whatsapp ?? "").replace(/\D/g, "");
    // web.whatsapp.com abre o WhatsApp Web no navegador (não o app instalado).
    return zap
      ? `https://web.whatsapp.com/send?phone=55${zap}&text=${encodeURIComponent(textoMsg(l))}`
      : `https://web.whatsapp.com/`;
  }

  function abrirWhats(l: FornecedorLinha) {
    window.open(waHref(l), "_blank", "noopener");
    marcarEnviado(l.id);
  }

  // Texto da mensagem (com o link) para um fornecedor.
  function textoMsg(l: FornecedorLinha) {
    const url = l.token ? `${origin}/cotar/${l.token}` : "";
    return template
      .replaceAll("{itens}", String(l.cobertura))
      .replaceAll("{nome}", l.nome)
      .replaceAll("{link}", url);
  }
  // Link do WhatsApp Web (abre no navegador, não no app instalado).
  function apiHref(l: FornecedorLinha) {
    const zap = (l.whatsapp ?? "").replace(/\D/g, "");
    return `https://web.whatsapp.com/send?phone=55${zap}&text=${encodeURIComponent(textoMsg(l))}`;
  }
  const comNumero = convidados.filter((l) => (l.whatsapp ?? "").replace(/\D/g, ""));

  const proximo = convidados.find((l) => !enviados.has(l.id));
  const enviadosCount = convidados.filter((l) => enviados.has(l.id)).length;

  return (
    <div className="mt-6 space-y-8">
      {/* Fornecedores disponíveis */}
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            Fornecedores que atendem estes itens
          </h2>
          {naoConvidados.length > 0 && (
            <button
              onClick={convidarTodos}
              disabled={convidandoTodos}
              className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
            >
              {convidandoTodos
                ? "Convidando..."
                : `Convidar todos (${naoConvidados.length})`}
            </button>
          )}
        </div>
        <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="px-4 py-3">Fornecedor</th>
                <th className="px-4 py-3 text-right">Fornece</th>
                <th className="px-4 py-3 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {linhas.map((l) => (
                <tr key={l.id} className="bg-white dark:bg-zinc-950">
                  <td className="px-4 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                    {l.nome}
                    {!l.whatsapp && (
                      <span className="ml-2 text-[10px] text-amber-500">sem WhatsApp</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right text-zinc-500">
                    {l.cobertura} de {totalItens}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {l.convidado ? (
                      <button
                        onClick={() => remover(l.id)}
                        className="text-xs text-zinc-400 hover:text-red-600"
                      >
                        Remover
                      </button>
                    ) : (
                      <button
                        onClick={() => convidar(l.id)}
                        className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      >
                        Convidar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {convidados.length > 0 && (
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Enviar os links ({enviadosCount}/{convidados.length} enviados)
            </h2>
            <div className="flex items-center gap-2">
              {proximo ? (
                <button
                  onClick={() => abrirWhats(proximo)}
                  className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
                >
                  📲 Abrir WhatsApp do próximo ({convidados.length - enviadosCount} faltam)
                </button>
              ) : (
                <span className="rounded-lg bg-green-100 px-3 py-2 text-sm font-medium text-green-700 dark:bg-green-950 dark:text-green-300">
                  ✓ Todos abertos
                </span>
              )}
              {enviadosCount > 0 && (
                <button
                  onClick={resetarEnviados}
                  className="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                >
                  Zerar
                </button>
              )}
            </div>
          </div>

          {/* Mensagem configurável */}
          <details className="mb-3 rounded-xl border border-zinc-200 dark:border-zinc-800">
            <summary className="cursor-pointer px-4 py-2 text-sm text-zinc-500">
              ✏️ Editar a mensagem enviada
            </summary>
            <div className="border-t border-zinc-100 p-3 dark:border-zinc-800">
              <textarea
                rows={3}
                value={template}
                onChange={(e) => salvarTemplate(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
              <p className="mt-1 text-[11px] text-zinc-400">
                Use <b>{"{link}"}</b> (o link), <b>{"{itens}"}</b> (qtd de itens) e{" "}
                <b>{"{nome}"}</b> (nome do fornecedor). A mensagem fica salva.
              </p>
            </div>
          </details>

          <p className="mb-3 text-xs text-zinc-400">
            Clique em <b>Abrir WhatsApp do próximo</b>: abre a conversa já com a
            mensagem e o link prontos — é só apertar enviar no WhatsApp e voltar
            aqui para o próximo. (O envio automático não é possível pelo site.)
          </p>

          <div className="space-y-2">
            {convidados.map((l) => {
              const foi = enviados.has(l.id);
              const url = l.token ? `${origin}/cotar/${l.token}` : "";
              return (
                <div
                  key={l.id}
                  className={`flex flex-wrap items-center gap-2 rounded-xl border p-3 ${
                    foi
                      ? "border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20"
                      : "border-zinc-200 dark:border-zinc-800"
                  }`}
                >
                  <span className="w-5 text-center">{foi ? "✓" : ""}</span>
                  <span className="min-w-32 flex-1 font-medium text-zinc-900 dark:text-zinc-100">
                    {l.nome}
                    {!l.whatsapp && (
                      <span className="ml-2 text-[10px] text-amber-500">sem número</span>
                    )}
                  </span>
                  {l.respondido ? (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950 dark:text-green-300">
                      Respondeu
                    </span>
                  ) : (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                      Aguardando
                    </span>
                  )}
                  <button
                    onClick={() => navigator.clipboard.writeText(url)}
                    className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    Copiar link
                  </button>
                  <button
                    onClick={() => abrirWhats(l)}
                    className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700"
                  >
                    WhatsApp
                  </button>
                </div>
              );
            })}
          </div>

          {/* Modo plugin: links de verdade para o VMarket WhatsApp Sender varrer */}
          <details className="mt-4 rounded-xl border border-zinc-200 dark:border-zinc-800">
            <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              🧩 Modo plugin (VMarket WhatsApp Sender)
            </summary>
            <div className="border-t border-zinc-100 p-4 dark:border-zinc-800">
              <p className="mb-3 text-xs text-zinc-500">
                O plugin procura <b>links de WhatsApp</b> na página. Abaixo estão os
                links de cada fornecedor (com a mensagem e o link da cotação já
                prontos). Deixe esta seção aberta e clique em <b>“Enviar Mensagem”</b>{" "}
                no plugin — ele deve encontrá-los e disparar.
                {comNumero.length < convidados.length && (
                  <> Fornecedores sem número não entram.</>
                )}
              </p>
              <div className="space-y-1 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900">
                {comNumero.map((l) => (
                  <div key={l.id}>
                    <a
                      href={apiHref(l)}
                      className="text-sm text-blue-600 underline"
                      data-whatsapp="1"
                      data-telefone={`55${(l.whatsapp ?? "").replace(/\D/g, "")}`}
                    >
                      {l.nome} — {(l.whatsapp ?? "").replace(/\D/g, "")}
                    </a>
                  </div>
                ))}
                {comNumero.length === 0 && (
                  <p className="text-sm text-zinc-400">
                    Nenhum fornecedor com número de WhatsApp cadastrado.
                  </p>
                )}
              </div>
              <p className="mt-2 text-[11px] text-zinc-400">
                Se o plugin ainda disser “nenhum link encontrado”, me avise o
                formato que ele espera (às vezes é <code>wa.me</code> em vez de{" "}
                <code>api.whatsapp.com</code>) que eu ajusto.
              </p>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
