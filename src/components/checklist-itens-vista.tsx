// Uma lista executada, item a item, com as fotos. Sem hooks: usada no
// acompanhamento de hoje, no histórico e (dentro do cliente) na revisão.
import { ROTULO_TIPO, itemRespondido, porSecao, type ModeloItem, type Resposta } from "@/lib/checklists-core";

const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
const numero = (n: number) => Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 3 });

export function ChecklistItensVista({
  itens, respostas, acao,
}: {
  itens: ModeloItem[];
  respostas: Resposta[];
  // Botão opcional por item (a revisão usa pra "Apontar correção").
  acao?: (item: ModeloItem, resposta: Resposta | undefined) => React.ReactNode;
}) {
  const porItem = new Map(respostas.map((r) => [r.item_id, r]));
  return (
    <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
      {porSecao(itens).flatMap((grupo, gi) => [
        ...(grupo.secao
          ? [<li key={`s${gi}`} className="pt-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-zinc-400">{grupo.secao}</li>]
          : []),
        ...grupo.itens.map((i) => {
        const n = itens.indexOf(i);
        const r = porItem.get(i.id);
        const ok = itemRespondido(i, r);
        return (
          <li key={i.id} className={`flex flex-wrap items-start gap-3 py-2 ${ok ? "" : "bg-red-50/60 dark:bg-red-950/20"}`}>
            <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-sm font-bold ${ok ? "bg-emerald-500 text-white" : "border-2 border-red-400 text-red-500"}`}>
              {ok ? "✓" : "!"}
            </span>
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-medium ${ok ? "text-zinc-800 dark:text-zinc-100" : "text-red-700 dark:text-red-300"}`}>
                <span className="mr-1 text-xs text-zinc-400">{n + 1}.</span>
                {i.texto}
                {i.obrigatorio && <span className="ml-1 text-red-600" title="obrigatório">*</span>}
                {!ok && <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-950 dark:text-red-300">não feito</span>}
              </p>
              <p className="text-xs text-zinc-500">
                {i.tipo !== "feito" && <span className="mr-2 text-zinc-400">{ROTULO_TIPO[i.tipo]}</span>}
                {r?.valor != null && <b className="text-zinc-800 dark:text-zinc-100">{numero(r.valor)}</b>}
                {r?.texto && <span className="text-zinc-700 dark:text-zinc-200">“{r.texto}”</span>}
                {r?.por_nome && <span className="ml-2">{r.por_nome} · {hora(r.em)}</span>}
                {i.exige_foto && !r?.foto_url && <span className="ml-2 text-amber-600">sem a foto</span>}
              </p>
            </div>
            {r?.foto_url && (
              <a href={r.foto_url} target="_blank" rel="noopener" title="abrir a foto">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.foto_url} alt={`foto de ${i.texto}`} className="h-16 w-16 rounded-lg object-cover transition hover:scale-105" />
              </a>
            )}
            {acao?.(i, r)}
          </li>
        );
        }),
      ])}
    </ul>
  );
}
