import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import * as core from "@/lib/cardapio-dia-core";
import { kernDoDia, podeEditarMarmita } from "@/lib/marmitas-cardapio";
import { diaDoCardapio, diaSemanaIso } from "@/lib/dia-cardapio";
import { colabCardapio } from "./actions";
import { CardapioApp } from "./cardapio-app";

export const metadata = { title: "Cardápio do dia · Brasa" };
export const dynamic = "force-dynamic";

// Cardápio do dia pelo app da equipe. Só abre pra quem tem a caixinha
// "Editar cardápio do dia" e entrou com o PIN — conferido no servidor, aqui
// e em cada ação (não é só esconder o botão).
export default async function CardapioColabPage({
  params, searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ dia?: string }>;
}) {
  const { token } = await params;
  const { dia: diaParam = "" } = await searchParams;
  const colab = await colabCardapio(token);

  if (!colab) {
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <p className="text-zinc-500">Esta tela é só pra quem tem a liberação de editar o cardápio — ou entre com o PIN de novo.</p>
        <Link href={`/eu/${token}`} className="mt-3 inline-block text-sm text-orange-600">← Voltar</Link>
      </div>
    );
  }

  // Abre já no próximo dia a ser servido (virada 13:30, pula domingo).
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(diaParam) ? diaParam : diaDoCardapio();
  const db = createAdminClient() as core.Db;
  const dow = diaSemanaIso(dia);
  const [cardapio, itens, base, marcadas, padrao, historico, kern, podeMarmita, estat] = await Promise.all([
    core.lerCardapioDia(db, dia),
    core.listarCatalogo(db),
    core.listarSaladasBase(db),
    core.saladasDoDia(db, dia),
    core.padraoSemanaSaladas(db, dow),
    core.historicoPublicacoes(db, { data: dia, limite: 12 }),
    kernDoDia(dia).catch(() => null),
    podeEditarMarmita(dia).catch(() => ({ ok: false as const, motivo: "Não consegui ler o cadastro das marmitas.", abreEm: { data: dia, hora: "" } })),
    core.estatisticasPratos(db, dia),
  ]);

  return (
    <div className="mx-auto min-h-screen max-w-md bg-zinc-50 p-4 pb-24 dark:bg-zinc-950">
      <div className="flex items-center justify-between">
        <Link href={`/eu/${token}`} className="text-sm text-zinc-500">← Voltar</Link>
        <span className="text-xs text-zinc-400">{colab.nome.split(" ")[0]}</span>
      </div>
      <CardapioApp
        key={dia}
        token={token}
        dia={dia}
        cardapio={cardapio}
        itens={itens}
        base={base}
        marcadas={marcadas}
        padrao={padrao}
        historico={historico}
        kern={kern}
        podeMarmita={podeMarmita}
        estat={estat}
      />
    </div>
  );
}
