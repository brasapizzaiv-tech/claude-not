import { createClient } from "@/lib/supabase/server";
import { Icone } from "@/components/icone";
import * as core from "@/lib/cardapio-dia-core";
import { kernDoDia, podeEditarMarmita } from "@/lib/marmitas-cardapio";
import { addDiasIso, diaSemanaIso } from "@/lib/dia-cardapio";
import { CardapioHistorico } from "@/components/cardapio-historico";
import { MarmitaDiaForm } from "@/components/marmita-dia-form";
import { EditorCardapio, type AlertaCardapio } from "./editor";
import { SaladasDoDia } from "./saladas-dia";
import { salvarMarmitaDia } from "./actions";
import { pratosComPrecoAdicional } from "@/lib/marmitas-do-cardapio";
import { perfilDaSessao } from "@/lib/sessao";
import { podeAcessar } from "@/lib/permissoes";
import { modulosDaEmpresa } from "@/lib/modulos-empresa";
import { carregarFichas } from "@/lib/fichas";
import { chavePrato } from "@/lib/cardapio-conflitos";
import type { CustoPrato } from "./editor";

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
  const [dias, itens, base, marcadas, padrao, historico, kern, podeMarmita, precos, comPrecoAdicional, ideias, alertas] = await Promise.all([
    core.listarCardapios(db, addDiasIso(hoje, -21), addDiasIso(hoje, 21)),
    core.listarCatalogo(db),
    core.listarSaladasBase(db),
    core.saladasDoDia(db, dia),
    core.padraoSemanaSaladas(db, dowDia),
    core.historicoPublicacoes(db, { limite: 40 }),
    kernDoDia(dia).catch(() => null),
    podeEditarMarmita(dia).catch(() => ({ ok: false as const, motivo: "Não consegui ler o cadastro das marmitas.", abreEm: { data: dia, hora: "" } })),
    core.precosBuffet(db),
    pratosComPrecoAdicional(db),
    core.ideiasDoDia(db, dia).catch(() => ({ anterior: null, esquecidos: [] })),
    db.from("cardapio_alertas").select("id, data, conflitos, motivo, por_nome, criado_em, visto_em").order("criado_em", { ascending: false }).limit(10)
      .then((r) => (r.data as AlertaCardapio[] | null) ?? []),
  ]);

  // Custo por kg de cada prato (fichas técnicas, 0320): só pra quem pode ver as fichas.
  const perfil = await perfilDaSessao();
  let custos: Record<string, CustoPrato> | null = null;
  if (podeAcessar("/fichas-tecnicas", perfil?.papel === "dono", (perfil?.permissoes as string[] | null) ?? [], await modulosDaEmpresa(perfil?.empresa_id ?? null))) {
    custos = {};
    const f = await carregarFichas(supabase).catch(() => null);
    // Cada prato aponta pra sua ficha (0321); a mesma ficha serve a vários nomes.
    for (const it of itens) {
      const c = it.ficha_id ? f?.custos.get(it.ficha_id) : null;
      if (it.ficha_id && c?.custoKg != null) custos[chavePrato(it.grupo, it.nome)] = { custoKg: c.custoKg, fichaId: it.ficha_id, pendencias: c.pendencias };
    }
  }

  return (
    <div className="pagina space-y-8">
      <EditorCardapio
        key={dia}
        dia={dia}
        hoje={hoje}
        dias={dias}
        atual={dias.find((c) => c.data === dia) ?? null}
        itens={itens}
        precos={precos}
        comPrecoAdicional={comPrecoAdicional}
        custos={custos}
        ideias={ideias}
        alertas={alertas}
      />
      <SaladasDoDia key={"sal-" + dia} dia={dia} dow={dowDia} base={base} marcadas={marcadas} padrao={padrao} />

      <div>
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="cartao p-5">
            <h2 className="mb-1 text-lg font-bold text-texto"><Icone nome="marmita" tamanho={17} className="mr-1.5" /> Marmitas {kern?.nomeConvenio ?? "Kern"} · {dia.split("-").reverse().slice(0, 2).join("/")}</h2>
            <p className="mb-3 text-sm text-texto-suave">A rotação de 4 semanas fica no app do convênio. Aqui você troca só este dia, enquanto os pedidos dele ainda não abriram.</p>
            <MarmitaDiaForm key={"kern-" + dia} dia={dia} kern={kern} pode={podeMarmita} salvar={salvarMarmitaDia} />
          </div>
          <div className="cartao p-5">
            <h2 className="mb-1 text-lg font-bold text-texto"><Icone nome="relogio" tamanho={17} className="mr-1.5" /> Histórico de publicações</h2>
            <p className="mb-3 text-sm text-texto-suave">Quem salvou, publicou ou tirou do ar — pelo painel ou pelo app da equipe.</p>
            <CardapioHistorico itens={historico} />
          </div>
        </div>
      </div>
    </div>
  );
}
