import { createClient } from "@/lib/supabase/server";
import * as core from "@/lib/cardapio-dia-core";
import { kernDoDia, podeEditarMarmita } from "@/lib/marmitas-cardapio";
import { addDiasIso, diaSemanaIso } from "@/lib/dia-cardapio";
import { CardapioHistorico } from "@/components/cardapio-historico";
import { MarmitaDiaForm } from "@/components/marmita-dia-form";
import { EditorCardapio } from "./editor";
import { SaladasDoDia } from "./saladas-dia";
import { salvarMarmitaDia } from "./actions";

// Hoje no fuso de Brasília (UTC−3, sem horário de verão).
function hojeBR() {
  return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

export default async function CardapioDoDiaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const hoje = hojeBR();
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(sp.dia ?? "") ? sp.dia : hoje;

  const supabase = await createClient();
  const db = supabase as unknown as core.Db;
  const dowDia = diaSemanaIso(dia);
  const [dias, itens, base, marcadas, padrao, historico, kern, podeMarmita] = await Promise.all([
    core.listarCardapios(db, addDiasIso(hoje, -21), addDiasIso(hoje, 21)),
    core.listarCatalogo(db),
    core.listarSaladasBase(db),
    core.saladasDoDia(db, dia),
    core.padraoSemanaSaladas(db, dowDia),
    core.historicoPublicacoes(db, { limite: 40 }),
    kernDoDia(dia).catch(() => null),
    podeEditarMarmita(dia).catch(() => ({ ok: false as const, motivo: "Não consegui ler o cadastro das marmitas.", abreEm: { data: dia, hora: "" } })),
  ]);

  return (
    <>
      <EditorCardapio
        key={dia}
        dia={dia}
        hoje={hoje}
        dias={dias}
        atual={dias.find((c) => c.data === dia) ?? null}
        itens={itens}
      />
      <SaladasDoDia key={"sal-" + dia} dia={dia} dow={dowDia} base={base} marcadas={marcadas} padrao={padrao} />

      <div className="mx-auto max-w-6xl px-8 pb-10">
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
            <h2 className="mb-1 text-lg font-bold text-zinc-900 dark:text-zinc-50">🍱 Marmitas {kern?.nomeConvenio ?? "Kern"} · {dia.split("-").reverse().slice(0, 2).join("/")}</h2>
            <p className="mb-3 text-sm text-zinc-500">A rotação de 4 semanas fica no app do convênio. Aqui você troca só este dia, enquanto os pedidos dele ainda não abriram.</p>
            <MarmitaDiaForm key={"kern-" + dia} dia={dia} kern={kern} pode={podeMarmita} salvar={salvarMarmitaDia} />
          </div>
          <div className="rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
            <h2 className="mb-1 text-lg font-bold text-zinc-900 dark:text-zinc-50">🕓 Histórico de publicações</h2>
            <p className="mb-3 text-sm text-zinc-500">Quem salvou, publicou ou tirou do ar — pelo painel ou pelo app da equipe.</p>
            <CardapioHistorico itens={historico} />
          </div>
        </div>
      </div>
    </>
  );
}
