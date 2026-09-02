"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  conferirPedidoColab,
  adicionarItemColab,
  removerItemColab,
} from "./actions";
import { dataBR } from "@/lib/format";
import { Combobox } from "@/components/combobox";

export type ItemPed = {
  id: string;
  nome: string;
  unidade: string;
  qtd: number;
  qtd_conf: number | null;
};
export type PedidoColab = {
  id: string;
  fornecedor: string | null;
  data: string;
  prazo_entrega: string | null;
  status: string;
  conf_em: string | null;
  conf_por: string | null;
  itens: ItemPed[];
};

const numOk = (s: string) => /^\s*\d+([.,]\d+)?\s*$/.test(s);
const paraEnvio = (s: string) => s.trim().replace(",", ".");
const mostrar = (n: number | null | undefined) =>
  n == null ? "" : String(n).replace(".", ",");

export function PedidosColab({
  token,
  pedidos,
  produtos,
}: {
  token: string;
  pedidos: PedidoColab[];
  produtos: { id: string; nome: string }[];
}) {
  const [aba, setAba] = useState<"pendentes" | "conferidos">("pendentes");
  if (pedidos.length === 0) return null;

  const pendentes = pedidos.filter((p) => !p.conf_em);
  const conferidos = pedidos.filter((p) => p.conf_em);
  const lista = aba === "pendentes" ? pendentes : conferidos;

  const tab = (ativo: boolean) =>
    `flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
      ativo
        ? "bg-orange-500 text-white"
        : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300"
    }`;

  return (
    <div className="mt-5">
      <div className="mb-3 flex items-center justify-center gap-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
        📦 Pedidos
      </div>
      <div className="mb-3 flex gap-2">
        <button onClick={() => setAba("pendentes")} className={tab(aba === "pendentes")}>
          Para conferir{pendentes.length > 0 ? ` (${pendentes.length})` : ""}
        </button>
        <button onClick={() => setAba("conferidos")} className={tab(aba === "conferidos")}>
          Conferidos{conferidos.length > 0 ? ` (${conferidos.length})` : ""}
        </button>
      </div>
      {lista.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-400 dark:border-zinc-700">
          {aba === "pendentes" ? "Nenhum pedido para conferir 🎉" : "Nenhum pedido conferido ainda."}
        </p>
      ) : (
        <div className="space-y-2">
          {lista.map((p) => (
            <PedidoCard key={p.id} token={token} pedido={p} produtos={produtos} />
          ))}
        </div>
      )}
    </div>
  );
}

function PedidoCard({
  token,
  pedido,
  produtos,
}: {
  token: string;
  pedido: PedidoColab;
  produtos: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  // Só o que a pessoa digitou; o resto vem do pedido. Assim um item adicionado
  // depois (que chega via router.refresh) já aparece com a quantidade e não é
  // apagado ao confirmar.
  const [qtds, setQtds] = useState<Record<string, string>>({});
  const valorDe = (i: ItemPed) => qtds[i.id] ?? mostrar(i.qtd_conf ?? i.qtd);
  const [salvando, start] = useTransition();
  const [feito, setFeito] = useState(!!pedido.conf_em);
  const [erro, setErro] = useState<string | null>(null);
  const [addProd, setAddProd] = useState("");
  const [addQtd, setAddQtd] = useState("");

  // marcar=false → salva as quantidades sem marcar como conferido (rascunho).
  const salvarAtual = (marcar: boolean) =>
    conferirPedidoColab(
      token,
      pedido.id,
      pedido.itens.map((i) => ({ id: i.id, qtd: paraEnvio(valorDe(i)) })),
      marcar,
    );

  function invalido() {
    const ruim = pedido.itens.find((i) => valorDe(i).trim() !== "" && !numOk(valorDe(i)));
    if (!ruim) return false;
    setErro(`Quantidade inválida em "${ruim.nome}". Use só números (ex.: 1,5).`);
    return true;
  }

  function confirmar() {
    setErro(null);
    if (invalido()) return;
    start(async () => {
      const r = await salvarAtual(true);
      if (r.ok) setFeito(true);
      else setErro("Não foi possível salvar. Confira as quantidades e tente de novo.");
    });
  }
  const addQtdNum = Number(paraEnvio(addQtd));
  function adicionar() {
    if (!addProd || !(addQtdNum > 0)) return;
    setErro(null);
    if (invalido()) return;
    start(async () => {
      await salvarAtual(false);
      const r = await adicionarItemColab(token, pedido.id, addProd, addQtdNum);
      if (!r.ok) { setErro("Não foi possível adicionar o item."); return; }
      setAddProd("");
      setAddQtd("");
      router.refresh();
    });
  }
  function remover(itemId: string) {
    start(async () => {
      await salvarAtual(false);
      await removerItemColab(token, itemId);
      router.refresh();
    });
  }

  return (
    <div
      className={`rounded-2xl border p-3 ${
        feito
          ? "border-green-200 bg-green-50/60 dark:border-green-900 dark:bg-green-950/20"
          : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      <button
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <span>
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">
            {pedido.fornecedor || "Fornecedor"}
          </span>
          <span className="ml-2 text-xs text-zinc-400">{dataBR(pedido.data)}</span>
          {pedido.prazo_entrega && (
            <span className="mt-0.5 block text-xs font-medium text-orange-600 dark:text-orange-400">
              🚚 entrega prevista: {dataBR(pedido.prazo_entrega)}
            </span>
          )}
        </span>
        <span className="text-xs">
          {feito ? (
            <span className="font-medium text-green-600">✓ conferido</span>
          ) : (
            <span className="text-orange-600">{aberto ? "▲" : "conferir ▼"}</span>
          )}
        </span>
      </button>

      {aberto && (
        <div className="mt-3 space-y-2">
          {pedido.itens.map((i) => {
            const v = valorDe(i);
            const ruim = v.trim() !== "" && !numOk(v);
            return (
              <div key={i.id} className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="break-words text-sm leading-snug text-zinc-700 dark:text-zinc-300">
                    {i.nome}
                  </div>
                  {i.qtd === 0 ? (
                    <span className="rounded bg-sky-100 px-1 py-0.5 text-[10px] font-medium text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                      veio a mais
                    </span>
                  ) : (
                    <div className="text-xs text-zinc-400">
                      pedido: {mostrar(i.qtd)} {i.unidade}
                    </div>
                  )}
                </div>
                <input
                  inputMode="decimal"
                  value={v}
                  onChange={(e) =>
                    setQtds((s) => ({ ...s, [i.id]: e.target.value }))
                  }
                  className={`w-20 shrink-0 rounded-lg border bg-white px-2 py-1.5 text-right text-sm dark:bg-zinc-950 dark:text-zinc-100 ${
                    ruim ? "border-red-400" : "border-zinc-300 dark:border-zinc-700"
                  }`}
                />
                <button
                  onClick={() => remover(i.id)}
                  disabled={salvando}
                  title="Remover item"
                  className="shrink-0 text-zinc-300 hover:text-red-600 disabled:opacity-50 dark:text-zinc-600"
                >
                  ✕
                </button>
              </div>
            );
          })}

          {/* Adicionar item que veio a mais */}
          <div className="rounded-xl border border-dashed border-sky-300 bg-sky-50/40 p-2.5 dark:border-sky-800 dark:bg-sky-950/10">
            <p className="mb-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300">
              Veio algo a mais? Adicione aqui:
            </p>
            <Combobox
              options={produtos.map((p) => ({ value: p.id, label: p.nome }))}
              value={addProd}
              onChange={setAddProd}
              placeholder="Buscar produto..."
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
            <div className="mt-2 flex items-center gap-2">
              <input
                inputMode="decimal"
                value={addQtd}
                onChange={(e) => setAddQtd(e.target.value)}
                placeholder="Qtd"
                className="w-20 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-right text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
              <button
                onClick={adicionar}
                disabled={salvando || !addProd || !(addQtdNum > 0)}
                className="flex-1 rounded-lg bg-sky-600 py-1.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
              >
                + Adicionar
              </button>
            </div>
          </div>

          {erro && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
              {erro}
            </p>
          )}
          <p className="text-[11px] text-zinc-400">
            Confirme quanto de cada item chegou (pode usar vírgula, ex.: 1,5 kg). Isso é só um aviso pro
            responsável — a conferência final continua com ele.
          </p>
          <button
            onClick={confirmar}
            disabled={salvando}
            className="w-full rounded-xl bg-orange-500 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
          >
            {salvando ? "Salvando..." : feito ? "Atualizar conferência" : "Confirmar recebimento"}
          </button>
          {feito && pedido.conf_por && (
            <p className="text-center text-[11px] text-green-600">
              Conferido por {pedido.conf_por}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
