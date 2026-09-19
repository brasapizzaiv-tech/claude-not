"use client";

import { Icone } from "@/components/icone";

import { siteUrl } from "@/lib/site-url";
import { useState, useEffect } from "react";
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
  contato: string | null;
  cobertura: number;
  convidado: boolean;
  token: string | null;
  respondido: boolean;
};

const EMPRESA = "Brasa Pizzaria e Restaurante";
const MSG_PADRAO_ANTIGA =
  "Olá! Segue o link para você nos passar os preços da nossa cotação ({itens} itens): {link}";
const MSG_PADRAO =
  "Olá {nome}! Aqui é da {empresa}. Segue o link para você nos passar os preços da nossa cotação ({itens} itens): {link}";

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
  // Extensão "Brasa WhatsApp Sender": depois de enviar pelo WhatsApp Web ela
  // avisa a página (postMessage) pra marcar o fornecedor como enviado.
  useEffect(() => {
    function ouvir(ev: MessageEvent) {
      if (ev.source !== window || ev.data?.type !== "BRASA_WHATS_ENVIADO" || !ev.data?.id) return;
      marcarEnviado(String(ev.data.id));
    }
    window.addEventListener("message", ouvir);
    return () => window.removeEventListener("message", ouvir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Origem do site lida na hora do clique (evita setState em render).
  const origin = siteUrl();
  const [convidandoTodos, setConvidandoTodos] = useState(false);
  const [template, setTemplate] = useState<string>(() => {
    if (typeof window === "undefined") return MSG_PADRAO;
    try {
      const salvo = localStorage.getItem("cot_msg_template");
      // Quem nunca personalizou (ou ainda tem o padrão antigo) ganha o novo.
      if (!salvo || salvo === MSG_PADRAO_ANTIGA) return MSG_PADRAO;
      return salvo;
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
      .replaceAll("{empresa}", EMPRESA)
      .replaceAll("{link}", url);
  }
  // Link do WhatsApp Web (abre no navegador, não no app instalado).
  function apiHref(l: FornecedorLinha) {
    const zap = (l.whatsapp ?? "").replace(/\D/g, "");
    return `https://web.whatsapp.com/send?phone=55${zap}&text=${encodeURIComponent(textoMsg(l))}`;
  }

  const proximo = convidados.find((l) => !enviados.has(l.id));
  const enviadosCount = convidados.filter((l) => enviados.has(l.id)).length;

  // Link ÚNICO do vendedor (várias empresas do mesmo vendedor num link só).
  const [selUnico, setSelUnico] = useState<Set<string>>(new Set());
  const [copiadoUnico, setCopiadoUnico] = useState(false);
  const toggleUnico = (id: string) =>
    setSelUnico((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  function copiarLinkUnico() {
    const toks = convidados.filter((l) => selUnico.has(l.id) && l.token).map((l) => l.token as string);
    if (toks.length < 2) return;
    const url = `${origin}/cotar/escolher?e=${toks.join(",")}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiadoUnico(true);
      setTimeout(() => setCopiadoUnico(false), 2500);
    });
  }

  return (
    <div className="mt-6 space-y-8">
      {/* Fornecedores disponíveis */}
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-texto-suave">
            Fornecedores que atendem estes itens
          </h2>
          {naoConvidados.length > 0 && (
            <button
              onClick={convidarTodos}
              disabled={convidandoTodos}
              className="min-h-11 rounded-controle bg-texto px-4 text-sm font-semibold text-fundo transition hover:opacity-90 disabled:opacity-60"
            >
              {convidandoTodos
                ? "Convidando..."
                : `Convidar todos (${naoConvidados.length})`}
            </button>
          )}
        </div>
        <div className="overflow-hidden rounded-cartao bg-painel-cartao">
          <table className="w-full text-sm">
            <thead className="text-left text-xs font-medium text-texto-fraco">
              <tr>
                <th className="px-4 py-3">Fornecedor</th>
                <th className="px-4 py-3 text-right">Fornece</th>
                <th className="px-4 py-3 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {linhas.map((l) => (
                <tr key={l.id} className="">
                  <td className="px-4 py-2 font-medium text-texto">
                    {l.nome}
                    {!l.whatsapp && (
                      <span className="ml-2 text-mini text-amber-500">sem WhatsApp</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right text-texto-suave">
                    {l.cobertura} de {totalItens}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {l.convidado ? (
                      <button
                        onClick={() => remover(l.id)}
                        className="text-xs text-texto-fraco hover:text-red-600"
                      >
                        Remover
                      </button>
                    ) : (
                      <button
                        onClick={() => convidar(l.id)}
                        className="rounded-controle border border-borda-forte px-3 py-1.5 text-xs font-medium text-texto-suave hover:bg-superficie-suave dark:border-borda-forte"
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
            <h2 className="text-lg font-semibold text-texto">
              Enviar os links ({enviadosCount}/{convidados.length} enviados)
            </h2>
            <div className="flex items-center gap-2">
              {proximo ? (
                <button
                  onClick={() => abrirWhats(proximo)}
                  className="rounded-controle bg-texto px-4 py-2 text-sm font-semibold text-fundo hover:opacity-90"
                >
                  <Icone nome="zap" tamanho={15} className="mr-1.5" /> Abrir WhatsApp do próximo ({convidados.length - enviadosCount} faltam)
                </button>
              ) : (
                <span className="rounded-controle bg-green-100 px-3 py-2 text-sm font-medium text-green-700 dark:bg-green-950 dark:text-green-300">
                  ✓ Todos abertos
                </span>
              )}
              {enviadosCount > 0 && (
                <button
                  onClick={resetarEnviados}
                  className="text-xs text-texto-fraco hover:text-texto-suave dark:hover:text-zinc-200"
                >
                  Zerar
                </button>
              )}
            </div>
          </div>

          {/* Link único: um vendedor que representa várias empresas */}
          {convidados.length > 1 && (
            <details className="mb-3 rounded-cartao bg-painel-cartao">
              <summary className="cursor-pointer px-4 py-2 text-sm text-texto-suave">
                <Icone nome="copiar" tamanho={14} className="mr-1.5" /> Link único (um vendedor com várias empresas)
              </summary>
              <div className="border-t border-borda p-3">
                <p className="mb-2 text-xs text-texto-suave">
                  Marque as empresas do mesmo vendedor. Ele recebe UM link e escolhe pra qual empresa vai passar cada preço.
                </p>
                <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1">
                  {convidados.map((l) => (
                    <label key={l.id} className="flex items-center gap-1.5 text-sm text-texto-suave">
                      <input type="checkbox" checked={selUnico.has(l.id)} onChange={() => toggleUnico(l.id)} className="h-4 w-4" />
                      {l.nome}
                    </label>
                  ))}
                </div>
                <button
                  onClick={copiarLinkUnico}
                  disabled={selUnico.size < 2}
                  className="rounded-controle bg-orange-500 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {copiadoUnico ? "✓ Link copiado!" : `Copiar link único (${selUnico.size} empresas)`}
                </button>
              </div>
            </details>
          )}

          {/* Mensagem configurável */}
          <details className="mb-3 rounded-cartao bg-painel-cartao">
            <summary className="cursor-pointer px-4 py-2 text-sm text-texto-suave">
              <Icone nome="editar" tamanho={14} className="mr-1.5" /> Editar a mensagem enviada
            </summary>
            <div className="border-t border-borda p-3">
              <textarea
                rows={3}
                value={template}
                onChange={(e) => salvarTemplate(e.target.value)}
                className="w-full min-h-11 rounded-controle border border-borda-forte bg-transparent px-3 text-sm text-texto outline-none focus:border-primaria"
              />
              <p className="mt-1 text-mini text-texto-fraco">
                Use <b>{"{link}"}</b> (o link), <b>{"{itens}"}</b> (qtd de itens),{" "}
                <b>{"{nome}"}</b> (nome do fornecedor) e <b>{"{empresa}"}</b> (nossa empresa). A mensagem fica salva.
              </p>
            </div>
          </details>

          <div className="mb-3 rounded-cartao bg-blue-50 p-3 text-xs text-blue-800 dark:bg-blue-950/30 dark:text-blue-200">
            <b>Como enviar:</b> clique em <b>Abrir WhatsApp do próximo</b> (ou em <b>Envio manual</b> na linha):
            abre o WhatsApp Web já com a mensagem e o link — é só apertar Enviar e voltar aqui pro próximo.
            <b>Envio automático:</b> com a extensão <b>Brasa WhatsApp Sender</b> instalada neste Chrome (e o WhatsApp Web
            logado), clique no ícone dela → <b>Enviar para os pendentes</b>. Ela manda uma a uma e marca &quot;Enviado&quot; aqui.
          </div>

          <div className="overflow-x-auto rounded-cartao bg-painel-cartao">
            <table className="w-full text-sm">
              <thead className="text-left text-xs font-medium text-texto-fraco">
                <tr>
                  <th className="px-4 py-3">Fornecedor</th>
                  <th className="px-4 py-3">Contato</th>
                  <th className="px-4 py-3">Telefone</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Envio manual</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borda">
                {convidados.map((l) => {
                  const foi = enviados.has(l.id);
                  const url = l.token ? `${origin}/cotar/${l.token}` : "";
                  const zap = (l.whatsapp ?? "").replace(/\D/g, "");
                  return (
                    <tr
                      key={l.id}
                      className={foi ? "bg-green-50/50 dark:bg-green-950/15" : "bg-painel-cartao "}
                    >
                      <td className="px-4 py-2 font-medium text-texto">
                        {l.nome}
                      </td>
                      <td className="px-4 py-2 text-texto-suave">
                        {l.contato || "—"}
                      </td>
                      <td className="px-4 py-2 text-texto-suave">
                        {zap ? (
                          zap
                        ) : (
                          <span className="text-amber-500">sem número</span>
                        )}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        {foi ? (
                          <span className="font-medium text-green-600">✓ Enviado</span>
                        ) : l.respondido ? (
                          <span className="font-medium text-green-600">Respondeu</span>
                        ) : (
                          <span className="text-amber-600">Pendente</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          <a
                            href={apiHref(l)}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => marcarEnviado(l.id)}
                            data-whatsapp="1"
                            data-telefone={`55${zap}`}
                            data-fornecedor-id={l.id}
                            data-fornecedor-nome={l.nome}
                            data-enviado={enviados.has(l.id) ? "1" : "0"}
                            className="rounded-controle bg-texto px-3 py-1.5 text-xs font-semibold text-fundo hover:opacity-90"
                          >
                            Envio manual
                          </a>
                          <button
                            onClick={() => navigator.clipboard.writeText(url)}
                            className="rounded-controle border border-borda-forte px-3 py-1.5 text-xs font-medium text-texto-suave hover:bg-superficie-suave dark:border-borda-forte"
                          >
                            Copiar link
                          </button>
                          <button
                            onClick={() => remover(l.id)}
                            className="rounded-controle border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/30"
                          >
                            Retirar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
