import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { moedaBR } from "@/lib/format";
import { type NomeIcone } from "@/components/icone";
import { Inicio, type DadosInicio, type Mesa } from "./inicio";

// Tela inicial do painel (Etapa 4 do design).
//
// Aqui só se busca e se conta. O desenho todo mora em inicio.tsx, o que deixa
// esta página legível e permite conferir a tela sem depender do banco.
//
// Tudo é do DIA escolhido (?dia=AAAA-MM-DD), não do mês. A comparação de cada
// indicador é contra o MESMO DIA DA SEMANA anterior — comparar sexta com quinta
// num restaurante não diz nada.

// Fora do componente: Date.now() dentro dele quebra a regra de pureza do React.
function hojeBR() {
  return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}
function agoraMs() {
  return Date.now();
}

const DIA = 86400000;
const somarDias = (iso: string, n: number) =>
  new Date(new Date(iso + "T12:00:00Z").getTime() + n * DIA).toISOString().slice(0, 10);

/** Começo e fim do dia no fuso de Brasília, em ISO, pra filtrar timestamptz. */
function janelaDoDia(dia: string) {
  return { de: `${dia}T03:00:00.000Z`, ate: `${somarDias(dia, 1)}T03:00:00.000Z` };
}

function porcentagem(agora: number, antes: number): number | null {
  if (!antes) return null;
  return Math.round((agora / antes - 1) * 100);
}

type GrupoMesa = { nome: string; de: number; ate: number };

function lerGrupos(bruto: string | undefined, qtd: number): GrupoMesa[] {
  try {
    const g = JSON.parse(bruto ?? "[]") as GrupoMesa[];
    const validos = g.filter((x) => x && x.nome && Number(x.de) >= 1 && Number(x.ate) >= Number(x.de));
    if (validos.length) return validos;
  } catch { /* configuração inválida: cai no padrão de baixo */ }
  return [{ nome: "Salão", de: 1, ate: qtd }];
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ dia?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("nome, papel, permissoes")
    .eq("id", user?.id ?? "")
    .single();

  const admin = profile?.papel === "dono";
  const permissoes = (profile?.permissoes as string[] | null) ?? [];

  // Usuário só de recepção: vai direto pra tela de celular das reservas.
  if (!admin && permissoes.includes("recepcao") && permissoes.every((p) => p === "recepcao")) {
    redirect("/reservas/hoje");
  }
  // Usuário só-garçom: entra direto no app do garçom.
  if (!admin && permissoes.includes("garcom") && permissoes.every((p) => p === "garcom")) {
    redirect("/garcom");
  }
  const pode = (k: string) => admin || permissoes.includes(k);

  const hoje = hojeBR();
  const { dia: diaPedido } = await searchParams;
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(diaPedido ?? "") ? diaPedido! : hoje;
  const ehHoje = dia === hoje;
  const semanaAtras = somarDias(dia, -7);
  const j = janelaDoDia(dia);
  const jAntes = janelaDoDia(semanaAtras);
  // Sete dias terminando no dia escolhido, pra linha de tendência.
  const inicioSerie = `${somarDias(dia, -6)}T03:00:00.000Z`;

  const [
    { data: cfgRows },
    { data: comandasAbertas },
    { data: caixaAberto },
    { data: movSerie },
    { data: rodizioDia },
    { data: deliveryDia },
    { data: etiquetasVencidas },
    { data: presencasHoje },
  ] = await Promise.all([
    supabase.from("pdv_config").select("chave, valor"),
    supabase
      .from("pdv_comandas")
      .select("id, numero, mesa, criado_em, conta_pedida_em, conta_pedida_por")
      .eq("status", "aberta"),
    supabase.from("pdv_caixas").select("id, saldo_inicial, aberto_em").eq("status", "aberto").maybeSingle(),
    // Movimentos dos últimos 7 dias + o dia da semana anterior, numa consulta só.
    supabase
      .from("pdv_caixa_mov")
      .select("tipo, valor, criado_em")
      .gte("criado_em", jAntes.de < inicioSerie ? jAntes.de : inicioSerie)
      .lt("criado_em", j.ate),
    supabase.from("pedidos_rodizio").select("status, quantidade, criado_em").gte("criado_em", j.de).lt("criado_em", j.ate),
    supabase
      .from("delivery_pedidos")
      .select("status, criado_em, previsao_em, saiu_em, entregue_em")
      .gte("criado_em", j.de)
      .lt("criado_em", j.ate),
    pode("etiquetas")
      ? supabase.from("etiquetas").select("id").eq("status", "ativa").lt("validade", dia)
      : Promise.resolve({ data: [] as { id: string }[] }),
    supabase.from("presencas").select("colaborador_id, turno").eq("data", dia),
  ]);

  const cfg: Record<string, string> = {};
  for (const r of (cfgRows as { chave: string; valor: string }[]) ?? []) cfg[r.chave] = r.valor;
  const qtdMesas = Math.max(1, Number(cfg.qtd_mesas || 40));
  const grupos = lerGrupos(cfg.mesa_grupos, qtdMesas);

  // ---------- Faturamento: do dia, do mesmo dia da semana passada, e a série ----------
  type Mov = { tipo: string; valor: number; criado_em: string };
  const movs = ((movSerie as Mov[]) ?? []).filter((m) => m.tipo === "venda");
  const somaEntre = (de: string, ate: string) =>
    movs.filter((m) => m.criado_em >= de && m.criado_em < ate).reduce((s, m) => s + Number(m.valor || 0), 0);

  const fatDia = somaEntre(j.de, j.ate);
  const fatAntes = somaEntre(jAntes.de, jAntes.ate);
  const serieFat: number[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = janelaDoDia(somarDias(dia, -i));
    serieFat.push(somaEntre(d.de, d.ate));
  }

  // ---------- Salão ----------
  type Com = {
    id: string; numero: number; mesa: string | null; criado_em: string;
    conta_pedida_em: string | null; conta_pedida_por: string | null;
  };
  const abertas = ((comandasAbertas as Com[]) ?? []).filter((c) => c.mesa);
  const porMesa = new Map<number, Com>();
  for (const c of abertas) {
    const n = Number(String(c.mesa).replace(/\D/g, ""));
    if (n >= 1) porMesa.set(n, c);
  }

  const gruposMesas = grupos.map((g) => {
    const mesas: Mesa[] = [];
    for (let n = g.de; n <= Math.min(g.ate, qtdMesas); n++) {
      const c = porMesa.get(n);
      mesas.push({
        numero: n,
        estado: !c ? "livre" : c.conta_pedida_em ? "conta" : "ocupada",
        comandaId: c?.id ?? null,
        contaPor: c?.conta_pedida_por ?? null,
      });
    }
    return { nome: g.nome, mesas };
  });
  const todasMesas = gruposMesas.flatMap((g) => g.mesas);
  const nOcupadas = todasMesas.filter((m) => m.estado === "ocupada").length;
  const nConta = todasMesas.filter((m) => m.estado === "conta").length;

  const agora = agoraMs();
  const maisVelha = [...abertas].sort((a, b) => a.criado_em.localeCompare(b.criado_em))[0];
  const maisAntiga = maisVelha
    ? {
        numero: Number(String(maisVelha.mesa).replace(/\D/g, "")) || maisVelha.numero,
        minutos: Math.max(0, Math.round((agora - new Date(maisVelha.criado_em).getTime()) / 60000)),
        comandaId: maisVelha.id,
      }
    : null;

  // ---------- Rodízio ----------
  type Rod = { status: string; quantidade: number; criado_em: string };
  const rods = (rodizioDia as Rod[]) ?? [];
  const rodizioTotal = rods.filter((r) => r.status !== "cancelado").reduce((s, r) => s + Number(r.quantidade || 1), 0);
  // "Parado": pedido de sabor ainda pendente há mais de 8 minutos — é o mesmo
  // limite que já pinta de vermelho na TV da cozinha.
  const rodAtrasados = rods.filter(
    (r) => r.status === "pendente" && agora - new Date(r.criado_em).getTime() > 8 * 60000,
  ).length;

  // ---------- Delivery ----------
  type Del = { status: string; criado_em: string; previsao_em: string | null; saiu_em: string | null; entregue_em: string | null };
  const dels = (deliveryDia as Del[]) ?? [];
  const delCozinha = dels.filter((p) => p.status === "em_preparo" || p.status === "aceito").length;
  const delRua = dels.filter((p) => p.status === "saiu").length;
  const entregues = dels.filter((p) => p.entregue_em);
  const tempos = entregues
    .map((p) => (new Date(p.entregue_em!).getTime() - new Date(p.criado_em).getTime()) / 60000)
    .filter((n) => n > 0 && n < 240);
  const tempoMedio = tempos.length ? Math.round(tempos.reduce((s, n) => s + n, 0) / tempos.length) : null;
  const delAtrasados = dels.filter(
    (p) => p.previsao_em && !p.entregue_em && p.status !== "cancelado" && agora > new Date(p.previsao_em).getTime(),
  ).length;

  // ---------- Itens em atraso ----------
  // O Rafael pediu um número só juntando os três. Como um número só esconde o
  // que está errado, a divisão vai junto e cada pedaço leva pra tela dele.
  const nEtiquetas = ((etiquetasVencidas as { id: string }[]) ?? []).length;
  const atrasoTotal = rodAtrasados + delAtrasados + nEtiquetas;

  // ---------- Quem está na casa ----------
  // Antes das 17h conta o turno do dia; da 17h em diante, o da noite.
  const horaAgora = Number(new Date(agora - 3 * 3600 * 1000).toISOString().slice(11, 13));
  const turnoAgora: "dia" | "noite" = horaAgora >= 17 ? "noite" : "dia";
  const presencas = ((presencasHoje as { colaborador_id: string; turno: string }[]) ?? []).filter(
    (p) => p.turno === turnoAgora,
  );
  let pessoasTurno: string[] = [];
  if (presencas.length) {
    const { data: colabs } = await supabase
      .from("colaboradores")
      .select("id, nome")
      .in("id", presencas.map((p) => p.colaborador_id));
    pessoasTurno = ((colabs as { id: string; nome: string }[]) ?? [])
      .map((c) => c.nome.split(" ")[0])
      .sort();
  }

  // ---------- Precisa de você ----------
  const pendencias: { rotulo: string; n: number; href: string; icone: NomeIcone }[] = [];
  if (pode("checklists")) {
    const { count } = await supabase
      .from("checklist_execucoes")
      .select("id", { count: "exact", head: true })
      .eq("data", dia)
      .is("concluido_em", null);
    if (count) pendencias.push({ rotulo: "Checklist não concluído", n: count, href: "/checklists", icone: "checklist" });
  }
  if (pode("cotacoes")) {
    const { count } = await supabase
      .from("cotacao_fornecedores")
      .select("id", { count: "exact", head: true })
      .eq("status", "enviado");
    if (count) pendencias.push({ rotulo: "Cotação sem resposta", n: count, href: "/cotacoes", icone: "moedas" });
  }
  if (pode("cardapio_dia")) {
    const { data: card } = await supabase.from("cardapio_dia").select("publicado").eq("data", dia).maybeSingle();
    if (!card?.publicado) {
      pendencias.push({ rotulo: "Cardápio do dia não publicado", n: 1, href: "/cardapio-do-dia", icone: "salao" });
    }
  }
  if (delAtrasados) {
    pendencias.push({ rotulo: "Entrega atrasada", n: delAtrasados, href: "/delivery", icone: "entrega" });
  }

  const dados: DadosInicio = {
    nome: (profile?.nome ?? user?.email ?? "").split(" ")[0] || "por aqui",
    dia,
    diaLegivel: new Date(dia + "T12:00:00Z").toLocaleDateString("pt-BR", {
      weekday: "long", day: "numeric", month: "long", timeZone: "UTC",
    }),
    ehHoje,
    indicadores: [
      {
        chave: "faturamento",
        rotulo: "Faturamento do dia",
        valor: moedaBR(fatDia),
        variacao: porcentagem(fatDia, fatAntes),
        serie: serieFat,
      },
      {
        chave: "comandas",
        rotulo: "Comandas abertas",
        valor: String(abertas.length),
        variacao: null,
        serie: [],
      },
      {
        chave: "atraso",
        rotulo: "Itens em atraso",
        valor: String(atrasoTotal),
        variacao: null,
        serie: [],
        detalhe: [
          { rotulo: "rodízio", n: rodAtrasados, href: "/cozinha" },
          { rotulo: "entrega", n: delAtrasados, href: "/delivery" },
          { rotulo: "etiqueta", n: nEtiquetas, href: "/etiquetas" },
        ].filter((x) => x.n > 0),
      },
    ],
    caixa: {
      aberto: !!caixaAberto,
      valor: moedaBR(fatDia),
      desde: caixaAberto?.aberto_em
        ? new Date(caixaAberto.aberto_em as string).toLocaleTimeString("pt-BR", {
            hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
          })
        : null,
    },
    salao: {
      grupos: gruposMesas,
      ocupadas: nOcupadas,
      livres: todasMesas.length - nOcupadas - nConta,
      conta: nConta,
      maisAntiga,
      rodizioDia: rodizioTotal,
    },
    delivery: { cozinha: delCozinha, rua: delRua, entregues: entregues.length, tempoMedio },
    pendencias,
    turno: { rotulo: turnoAgora === "noite" ? "à noite" : "de dia", pessoas: pessoasTurno },
  };

  return <Inicio d={dados} />;
}
