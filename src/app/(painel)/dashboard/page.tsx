import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buscarTodas } from "@/lib/supabase/todas";
import { moedaBR } from "@/lib/format";
import { tipoDe } from "@/lib/formas-pagamento";
import { formasParaTipo } from "@/lib/formas-pagamento-server";
import { pedidoAtrasado } from "@/lib/delivery-atraso";
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
    { data: cfgDelivery },
    contagemComandas,
    formasT,
  ] = await Promise.all([
    supabase.from("pdv_config").select("chave, valor"),
    supabase
      .from("pdv_comandas")
      .select("id, numero, mesa, aberta_em, conta_pedida_em, conta_pedida_por")
      .eq("status", "aberta"),
    supabase.from("pdv_caixas").select("id, saldo_inicial, aberto_em").eq("status", "aberto").maybeSingle(),
    // Movimentos dos últimos 7 dias + o dia da semana anterior. Em páginas:
    // uma semana cheia já tem ~500 e o banco corta cada consulta em 1000.
    buscarTodas((de, ate) =>
      supabase
        .from("pdv_caixa_mov")
        .select("tipo, valor, forma_pagamento, criado_em, caixa_id")
        .gte("criado_em", jAntes.de < inicioSerie ? jAntes.de : inicioSerie)
        .lt("criado_em", j.ate)
        .order("id")
        .range(de, ate),
    ).then((data) => ({ data })),
    supabase.from("pedidos_rodizio").select("status, quantidade, criado_em").gte("criado_em", j.de).lt("criado_em", j.ate),
    supabase
      .from("delivery_pedidos")
      .select("status, criado_em, previsao_em, saiu_em, entregue_em, agendado_para")
      .gte("criado_em", j.de)
      .lt("criado_em", j.ate),
    pode("etiquetas")
      ? supabase.from("etiquetas").select("id").eq("status", "ativa").lt("validade", dia)
      : Promise.resolve({ data: [] as { id: string }[] }),
    supabase.from("presencas").select("colaborador_id, turno").eq("data", dia),
    supabase.from("delivery_config").select("aberto").maybeSingle(),
    // Comandas abertas em cada um dos 7 dias + o mesmo dia da semana passada
    // (contagem pelo banco, sem trazer linhas: passa fácil de 1000 na semana).
    Promise.all(
      [...Array.from({ length: 7 }, (_, i) => somarDias(dia, i - 6)), semanaAtras].map(async (d) => {
        const jj = janelaDoDia(d);
        const { count } = await supabase.from("pdv_comandas").select("id", { count: "exact", head: true }).gte("aberta_em", jj.de).lt("aberta_em", jj.ate);
        return count ?? 0;
      }),
    ),
    formasParaTipo(),
  ]);

  const cfg: Record<string, string> = {};
  for (const r of (cfgRows as { chave: string; valor: string }[]) ?? []) cfg[r.chave] = r.valor;
  const qtdMesas = Math.max(1, Number(cfg.qtd_mesas || 40));
  const grupos = lerGrupos(cfg.mesa_grupos, qtdMesas);

  // ---------- Faturamento: do dia, do mesmo dia da semana passada, e a série ----------
  type Mov = { tipo: string; valor: number; forma_pagamento: string | null; criado_em: string; caixa_id: string };
  const movs = ((movSerie as Mov[]) ?? []).filter((m) => m.tipo === "venda");
  const somaEntre = (de: string, ate: string) =>
    movs.filter((m) => m.criado_em >= de && m.criado_em < ate).reduce((s, m) => s + Number(m.valor || 0), 0);

  const fatDia = somaEntre(j.de, j.ate);
  // Cartão do caixa: com caixa aberto (hoje), só o que entrou NESSE caixa — o
  // da noite começa do zero quando é aberto. Sem caixa aberto, o dia todo.
  const caixaAbertoId = ehHoje ? ((caixaAberto as { id: string } | null)?.id ?? null) : null;
  const movsCaixa = caixaAbertoId ? movs.filter((m) => m.caixa_id === caixaAbertoId) : movs.filter((m) => m.criado_em >= j.de && m.criado_em < j.ate);
  const fatCaixa = movsCaixa.reduce((s, m) => s + Number(m.valor || 0), 0);
  // Divisão em Pix / cartão / dinheiro; o resto (saldo cliente do convênio
  // Kern, vale refeição…) aparece pelo nome da forma, senão parecia que não
  // entrava na soma. O tipo vem do cadastro de formas de pagamento.
  const porTipo = { pix: 0, cartao: 0, dinheiro: 0 };
  const outras = new Map<string, number>();
  for (const m of movsCaixa) {
    const t = tipoDe(m.forma_pagamento, formasT);
    if (t === "pix" || t === "pix_maquina") porTipo.pix += Number(m.valor || 0);
    else if (t === "credito" || t === "debito" || t === "cartao") porTipo.cartao += Number(m.valor || 0);
    else if (t === "dinheiro") porTipo.dinheiro += Number(m.valor || 0);
    else {
      const nome = (m.forma_pagamento || "outros").toLowerCase();
      outras.set(nome, (outras.get(nome) ?? 0) + Number(m.valor || 0));
    }
  }
  // Dia × noite: a noite começa às 16h, o mesmo corte do 10% (servico_noites,
  // migration 0250). Tudo dentro da janela do dia, então dia + noite = total.
  const corteNoite = `${dia}T19:00:00.000Z`; // 16h em Brasília
  const fatTurnoDia = somaEntre(j.de, corteNoite);
  const fatTurnoNoite = somaEntre(corteNoite, j.ate);
  const fatAntes = somaEntre(jAntes.de, jAntes.ate);
  const serieFat: number[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = janelaDoDia(somarDias(dia, -i));
    serieFat.push(somaEntre(d.de, d.ate));
  }

  // ---------- Salão ----------
  type Com = {
    id: string; numero: number; mesa: string | null; aberta_em: string;
    conta_pedida_em: string | null; conta_pedida_por: string | null;
  };
  // Salão, balcão e balança; as do delivery ("Nome · ENTREGA/RETIRADA") têm o painel delas.
  const abertas = ((comandasAbertas as Com[]) ?? []).filter((c) => c.mesa && !/·\s*(ENTREGA|RETIRADA)\b/i.test(c.mesa));
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
  const maisVelha = [...abertas].sort((a, b) => a.aberta_em.localeCompare(b.aberta_em))[0];
  const maisAntiga = maisVelha
    ? {
        numero: Number(String(maisVelha.mesa).replace(/\D/g, "")) || maisVelha.numero,
        // "mesa 14" quando é mesa; senão "Balança nº 212".
        rotulo: /^mesa\s*\d+/i.test(String(maisVelha.mesa))
          ? `mesa ${String(maisVelha.mesa).replace(/\D/g, "")}`
          : `${maisVelha.mesa} nº ${maisVelha.numero}`,
        minutos: Math.max(0, Math.round((agora - new Date(maisVelha.aberta_em).getTime()) / 60000)),
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
  type Del = { status: string; criado_em: string; previsao_em: string | null; saiu_em: string | null; entregue_em: string | null; agendado_para: string | null };
  const dels = (deliveryDia as Del[]) ?? [];
  const delCozinha = dels.filter((p) => p.status === "em_preparo" || p.status === "aceito").length;
  const delRua = dels.filter((p) => p.status === "saiu").length;
  const entregues = dels.filter((p) => p.entregue_em);
  const tempos = entregues
    .map((p) => (new Date(p.entregue_em!).getTime() - new Date(p.criado_em).getTime()) / 60000)
    .filter((n) => n > 0 && n < 240);
  const tempoMedio = tempos.length ? Math.round(tempos.reduce((s, n) => s + n, 0) / tempos.length) : null;
  // Atrasado = passou de 45 min desde que entrou e ainda não foi entregue
  // (meta do delivery, a mesma da lista de pedidos).
  const delAtrasados = dels.filter((p) => pedidoAtrasado(p, agora)).length;

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
  // E quem bateu ponto neste turno: a presença só é lançada pra quem está
  // marcado "bate ponto", mas na casa está todo mundo que bateu.
  const { data: batidasTurno } = await supabase
    .from("ponto_batidas")
    .select("colaborador_id")
    .eq("data", dia)
    .eq("turno", turnoAgora)
    .eq("desconsiderada", false)
    .not("colaborador_id", "is", null);
  const naCasaIds = [...new Set([
    ...presencas.map((p) => p.colaborador_id),
    ...((batidasTurno as { colaborador_id: string }[]) ?? []).map((b) => b.colaborador_id),
  ])];
  let pessoasTurno: string[] = [];
  if (naCasaIds.length) {
    const { data: colabs } = await supabase
      .from("colaboradores")
      .select("id, nome")
      .in("id", naCasaIds);
    pessoasTurno = ((colabs as { id: string; nome: string }[]) ?? [])
      .map((c) => c.nome.split(" ")[0])
      .sort();
  }

  // ---------- Precisa de você ----------
  const pendencias: DadosInicio["pendencias"] = [];
  if (pode("checklists")) {
    const { count } = await supabase
      .from("checklist_execucoes")
      .select("id", { count: "exact", head: true })
      .eq("data", dia)
      .is("concluido_em", null);
    if (count) pendencias.push({ rotulo: count === 1 ? "Checklist de hoje ainda não foi concluído" : `${count} checklists de hoje não foram concluídos`, n: count, nota: count === 1 ? "checklist" : `${count} listas`, urgente: true, href: "/checklists", icone: "checklist" });
  }
  if (pode("cotacoes")) {
    const { count } = await supabase
      .from("cotacao_fornecedores")
      .select("id", { count: "exact", head: true })
      .eq("status", "enviado");
    if (count) pendencias.push({ rotulo: count === 1 ? "Uma cotação aguarda resposta do fornecedor" : `Cotações aguardam resposta de ${count} fornecedores`, n: count, nota: `${count} sem resposta`, urgente: false, href: "/cotacoes", icone: "moedas" });
  }
  if (pode("cardapio_dia")) {
    const { data: card } = await supabase.from("cardapio_dia").select("publicado").eq("data", dia).maybeSingle();
    if (!card?.publicado) {
      pendencias.push({ rotulo: "Cardápio do dia ainda não publicado", n: 1, nota: "cardápio", urgente: false, href: "/cardapio-do-dia", icone: "salao" });
    }
  }
  if (delAtrasados) {
    pendencias.unshift({ rotulo: delAtrasados === 1 ? "Um pedido do delivery está atrasado" : `${delAtrasados} pedidos do delivery estão atrasados`, n: delAtrasados, nota: "delivery", urgente: true, href: "/delivery", icone: "entrega" });
  }

  const dados: DadosInicio = {
    nome: (profile?.nome ?? user?.email ?? "").split(" ")[0] || "por aqui",
    saudacao: horaAgora < 12 ? "Bom dia" : horaAgora < 18 ? "Boa tarde" : "Boa noite",
    dia,
    diaLegivel: (() => {
      const t = new Date(dia + "T12:00:00Z").toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
      return t.charAt(0).toUpperCase() + t.slice(1);
    })(),
    ehHoje,
    indicadores: [
      {
        chave: "faturamento",
        rotulo: "Faturamento do dia",
        valor: moedaBR(fatDia),
        variacao: porcentagem(fatDia, fatAntes),
        serie: serieFat,
        turnos: [
          { rotulo: "Dia", valor: moedaBR(fatTurnoDia) },
          { rotulo: "Noite", valor: moedaBR(fatTurnoNoite) },
        ],
      },
      {
        chave: "comandas",
        rotulo: "Comandas abertas",
        valor: String(abertas.length),
        variacao: null,
        diferenca: contagemComandas[6] - contagemComandas[7],
        serie: contagemComandas.slice(0, 7),
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
      valor: moedaBR(fatCaixa),
      pix: moedaBR(porTipo.pix),
      cartao: moedaBR(porTipo.cartao),
      dinheiro: moedaBR(porTipo.dinheiro),
      outras: [...outras].filter(([, v]) => Math.abs(v) >= 0.01).sort((a, b) => b[1] - a[1]).map(([nome, v]) => ({ nome, valor: moedaBR(v) })),
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
    delivery: { aberto: !!(cfgDelivery as { aberto?: boolean } | null)?.aberto, cozinha: delCozinha, rua: delRua, entregues: entregues.length, tempoMedio },
    pendencias,
    turno: { rotulo: turnoAgora === "noite" ? "noite" : "dia", pessoas: pessoasTurno },
  };

  return <Inicio d={dados} />;
}
