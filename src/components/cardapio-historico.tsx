// Histórico de publicações do cardápio (quem fez o quê, quando). Usado no
// painel e no app da equipe. Sem hooks.
import { ROTULO_ACAO, type Publicacao } from "@/lib/cardapio-dia-core";

const ddmm = (iso: string) => iso.split("-").reverse().slice(0, 2).join("/");
const quando = (ts: string) =>
  new Date(ts).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export function CardapioHistorico({ itens, mostrarDia = true, grande = false }: { itens: Publicacao[]; mostrarDia?: boolean; grande?: boolean }) {
  if (itens.length === 0) return <p className={`${grande ? "text-base" : "text-sm"} text-zinc-400`}>Nenhuma publicação registrada ainda.</p>;
  return (
    <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
      {itens.map((h) => (
        <li key={h.id} className={`${grande ? "py-2.5 text-base" : "py-1.5 text-sm"} flex flex-wrap items-baseline gap-x-2 text-zinc-700 dark:text-zinc-300`}>
          <span className="tabular-nums text-zinc-400">{quando(h.em)}</span>
          {mostrarDia && <span className="font-semibold text-zinc-600 dark:text-zinc-200">cardápio de {ddmm(h.data)}</span>}
          <span>
            <b className="text-zinc-900 dark:text-zinc-50">{h.por_nome || "alguém"}</b>{" "}
            <span className={h.acao === "publicado" ? "font-semibold text-green-700 dark:text-green-400" : ""}>{ROTULO_ACAO[h.acao] ?? h.acao}</span>
            {h.detalhe ? <span className="text-zinc-400"> · {h.detalhe}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}
