"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BotaoAcao } from "@/components/enviar";
import { Icone } from "@/components/icone";
import { avisar, confirmar } from "@/components/dialogo";
import { alterarQtdItemPedido, excluirPedidoDaCotacao, tirarItemPedido } from "../../actions";

export type ItemPedidoTela = {
  id: string;
  nome: string;
  unidade: string;
  qtd: number;
  preco_unit: number | null;
};

const moeda = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const numero = (s: string) => {
  const t = s.trim();
  return Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
};

/** Itens do pedido. `mexivel` = ainda não chegou: dá pra mudar a quantidade e tirar item. */
export function ItensPedido({ itens, mexivel }: { itens: ItemPedidoTela[]; mexivel: boolean }) {
  return (
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Itens do pedido (role para os lados se precisar)">
      <table className="w-full text-sm">
        <tbody className="divide-y divide-borda">
          {itens.map((i) => <Linha key={i.id} item={i} mexivel={mexivel} />)}
        </tbody>
      </table>
    </div>
  );
}

function Linha({ item, mexivel }: { item: ItemPedidoTela; mexivel: boolean }) {
  const router = useRouter();
  const [texto, setTexto] = useState(String(item.qtd).replace(".", ","));
  const qtd = numero(texto);
  const mudou = Number.isFinite(qtd) && Math.abs(qtd - item.qtd) > 0.0005;

  return (
    <tr>
      <td className="py-1.5 text-texto">{item.nome}</td>
      <td className="py-1.5 text-right text-texto-suave">
        {mexivel ? (
          <span className="inline-flex items-center justify-end gap-2">
            <input
              aria-label={`Quantidade de ${item.nome}`}
              inputMode="decimal"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              className="campo w-24 text-right font-numero"
            />
            <span className="w-8 text-left">{item.unidade}</span>
            {mudou && (
              <BotaoAcao
                className="btn-principal min-h-11 px-3 text-sm"
                aoClicar={async () => {
                  const r = await alterarQtdItemPedido(item.id, qtd);
                  if (!r.ok) return avisar(r.erro);
                  router.refresh();
                }}
              >
                Salvar
              </BotaoAcao>
            )}
          </span>
        ) : (
          <>{item.qtd} {item.unidade}</>
        )}
      </td>
      <td className="py-1.5 text-right text-texto-suave">{item.preco_unit != null ? moeda(item.preco_unit) : "—"}</td>
      <td className="py-1.5 text-right text-texto">{item.preco_unit != null ? moeda(item.preco_unit * item.qtd) : "—"}</td>
      {mexivel && (
        <td className="py-1.5 pl-2 text-right">
          <BotaoAcao
            className="btn-secundario min-h-11 px-3 text-sm"
            aria-label={`Tirar ${item.nome} do pedido`}
            title="Tirar do pedido (sai da cotação também)"
            aoClicar={async () => {
              const ok = await confirmar(`Tirar ${item.nome} do pedido?`, {
                detalhe: "Sai do pedido e da cotação, pra não voltar quando gerar os pedidos de novo.",
                okTexto: "Tirar",
              });
              if (!ok) return;
              const r = await tirarItemPedido(item.id);
              if (!r.ok) return avisar(r.erro);
              router.refresh();
            }}
          >
            <Icone nome="fechar" tamanho={14} />
          </BotaoAcao>
        </td>
      )}
    </tr>
  );
}

export function ExcluirPedido({ pedidoId, fornecedor }: { pedidoId: string; fornecedor: string }) {
  const router = useRouter();
  return (
    <BotaoAcao
      className="btn-secundario text-sm"
      aoClicar={async () => {
        const ok = await confirmar(`Excluir o pedido do ${fornecedor}?`, {
          detalhe: "O pedido some de vez. Os itens continuam na cotação: se gerar os pedidos de novo, ele volta.",
          okTexto: "Excluir",
          perigo: true,
        });
        if (!ok) return;
        const r = await excluirPedidoDaCotacao(pedidoId);
        if (!r.ok) return avisar(r.erro);
        router.refresh();
      }}
    >
      <Icone nome="lixeira" tamanho={15} /> Excluir pedido
    </BotaoAcao>
  );
}
