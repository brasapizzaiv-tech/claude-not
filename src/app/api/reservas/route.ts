import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { empresaAtualId } from "@/lib/empresa";
import { diasFechados } from "@/lib/feriados-fechados";

// Reservas vindas do site público. A página é estática (public/site), então
// toda a regra fica aqui: nenhum dado de acesso ao banco aparece no HTML.

const TURNOS = ["Almoço", "Rodízio"];
const texto = (v: unknown, max: number) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";
const inteiro = (v: unknown) => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 200) : 0;
};
const ehData = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const hojeBR = () =>
  new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
const agoraHHMM = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(11, 16);
// Até que horas dá pra reservar pro MESMO dia (igual ao site).
const LIMITE_HOJE: Record<string, string> = { "Almoço": "11:45", "Rodízio": "18:45" };

// O site consulta o dia escolhido: turnos fechados e quanto já está ocupado.
export async function GET(req: NextRequest) {
  const data = req.nextUrl.searchParams.get("data") ?? "";
  const supabase = createAdminClient();

  // A página do site é estática, então tudo passa por aqui com a chave
  // administrativa — que não obedece às regras do banco. O restaurante vem do
  // endereço de quem chamou, e entra em cada consulta: sem isso, o site de um
  // mostraria a agenda lotada do outro.
  const empresaId = await empresaAtualId();
  if (!empresaId) {
    return NextResponse.json({ erro: "Restaurante não identificado." }, { status: 400 });
  }

  const { data: limData } = await supabase
    .from("reservas_limites")
    .select("*")
    .eq("empresa_id", empresaId);
  const limites = Object.fromEntries(
    ((limData as { turno: string }[]) ?? []).map((l) => [l.turno, l]),
  );
  if (!ehData(data)) return NextResponse.json({ limites, bloqueios: [], lotacao: {} });

  const [{ data: bloqData }, { data: resData }, fechado] = await Promise.all([
    supabase
      .from("reservas_bloqueios")
      .select("turno, motivo")
      .eq("empresa_id", empresaId)
      .eq("data", data),
    supabase
      .from("reservas")
      .select("turno, pessoas")
      .eq("empresa_id", empresaId)
      .eq("data", data)
      .neq("status", "cancelada"),
    diasFechados(supabase, empresaId, data, data),
  ]);
  // Feriado com a casa fechada (tela /feriados) fecha o dia todo pras reservas.
  const bloqueios = [...((bloqData as { turno: string; motivo: string | null }[]) ?? [])];
  if (fechado.has(data)) bloqueios.push({ turno: "Dia todo", motivo: `Feriado (${fechado.get(data)})` });

  const lotacao: Record<string, { reservas: number; pessoas: number }> = {};
  for (const r of (resData as { turno: string; pessoas: number }[]) ?? []) {
    const l = (lotacao[r.turno] ??= { reservas: 0, pessoas: 0 });
    l.reservas++;
    l.pessoas += Number(r.pessoas) || 0;
  }

  return NextResponse.json({
    limites,
    bloqueios,
    lotacao,
  });
}

export async function POST(req: NextRequest) {
  let corpo: Record<string, unknown>;
  try {
    corpo = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
  }

  const nome = texto(corpo.nome, 120);
  const telefone = texto(corpo.telefone, 40);
  const data = texto(corpo.data, 10);
  const turno = texto(corpo.turno, 20);
  const adultos = inteiro(corpo.adultos);
  const criancas = inteiro(corpo.criancas);
  const pessoas = adultos + criancas;

  if (!nome || !telefone) return NextResponse.json({ erro: "Falta nome ou telefone." }, { status: 400 });
  // Turno desconhecido é erro, não vira "Almoço" no chute.
  if (!TURNOS.includes(turno))
    return NextResponse.json({ erro: "Escolha o turno da reserva." }, { status: 400 });
  if (!ehData(data) || data < hojeBR())
    return NextResponse.json({ erro: "Escolha um dia válido." }, { status: 400 });
  if (pessoas < 1) return NextResponse.json({ erro: "Quantas pessoas vão?" }, { status: 400 });

  // MAR-07: as regras do site também aqui (antes só no navegador).
  const dow = new Date(`${data}T12:00:00Z`).getUTCDay();
  if (dow === 0) return NextResponse.json({ erro: "Domingo não abrimos. Escolha outro dia." }, { status: 409 });
  if (turno === "Rodízio" && dow !== 5 && dow !== 6)
    return NextResponse.json({ erro: "O rodízio é só na sexta e no sábado." }, { status: 409 });
  if (data === hojeBR() && agoraHHMM() > (LIMITE_HOJE[turno] ?? "23:59"))
    return NextResponse.json(
      { erro: `Já passou das ${LIMITE_HOJE[turno].replace(":", "h")}, o horário limite pra reservar hoje. Pode vir sem reserva: atendemos por ordem de chegada.` },
      { status: 409 },
    );

  const supabase = createAdminClient();
  const empresaId = await empresaAtualId();
  if (!empresaId) {
    return NextResponse.json({ erro: "Restaurante não identificado." }, { status: 400 });
  }

  // SEC-19: freio contra reserva falsa em massa (lotaria o turno). Do mesmo
  // telefone, no máximo 3 pelo site em 24 h; no total, 40 pelo site por hora.
  const { data: recentes } = await supabase
    .from("reservas")
    .select("telefone, criado_em")
    .eq("empresa_id", empresaId)
    .eq("origem", "site")
    .gte("criado_em", new Date(Date.now() - 86400_000).toISOString())
    .limit(1000);
  const rec = (recentes as { telefone: string | null; criado_em: string }[]) ?? [];
  const digitos = (t: string | null) => String(t ?? "").replace(/\D/g, "").slice(-9);
  const meuTel = digitos(telefone);
  const umaHora = Date.now() - 3600_000;
  if ((meuTel && rec.filter((r) => digitos(r.telefone) === meuTel).length >= 3) || rec.filter((r) => new Date(r.criado_em).getTime() >= umaHora).length >= 40)
    return NextResponse.json(
      { erro: "Já recebemos reservas deste telefone. Pra fazer outra ou mudar alguma, nos chame no WhatsApp." },
      { status: 429 },
    );

  // Dia (ou turno) fechado pela equipe.
  const { data: bloq } = await supabase
    .from("reservas_bloqueios")
    .select("turno")
    .eq("empresa_id", empresaId)
    .eq("data", data);
  const fechados = ((bloq as { turno: string }[]) ?? []).map((b) => b.turno);
  if ((await diasFechados(supabase, empresaId, data, data)).has(data)) fechados.push("Dia todo");
  if (fechados.includes("Dia todo") || fechados.includes(turno))
    return NextResponse.json(
      { erro: "Esse horário está fechado para reservas." },
      { status: 409 },
    );

  // Lotação do turno.
  const [{ data: limData }, { data: doDia }] = await Promise.all([
    supabase
      .from("reservas_limites")
      .select("*")
      .eq("empresa_id", empresaId)
      .eq("turno", turno)
      .maybeSingle(),
    supabase
      .from("reservas")
      .select("pessoas")
      .eq("empresa_id", empresaId)
      .eq("data", data)
      .eq("turno", turno)
      .neq("status", "cancelada"),
  ]);
  const limite = (limData as {
    max_reservas: number;
    max_pessoas: number;
    grupo_grande: number;
  } | null) ?? { max_reservas: 30, max_pessoas: 120, grupo_grande: 12 };
  const jaFeitas = ((doDia as { pessoas: number }[]) ?? []).length;
  const jaPessoas = ((doDia as { pessoas: number }[]) ?? []).reduce(
    (s, r) => s + (Number(r.pessoas) || 0),
    0,
  );
  if (jaPessoas + pessoas > limite.max_pessoas || jaFeitas >= limite.max_reservas)
    return NextResponse.json(
      { erro: "As mesas desse horário já estão tomadas. Escolha outro dia ou nos chame no WhatsApp." },
      { status: 409 },
    );

  // Grupo grande entra como pedido: a equipe confirma se há mesas.
  const status = pessoas >= limite.grupo_grande ? "aguardando" : "nova";
  const nascimento = texto(corpo.nascimento, 10);

  const { data: nova, error } = await supabase.from("reservas").insert({
    empresa_id: empresaId,
    nome,
    telefone,
    data,
    turno,
    chegada: texto(corpo.chegada, 20) || null,
    pessoas,
    adultos,
    criancas,
    lugar: texto(corpo.lugar, 30) || null,
    ocasiao: texto(corpo.ocasiao, 40) || null,
    nascimento: ehData(nascimento) ? nascimento : null,
    observacao: texto(corpo.observacao, 500) || null,
    status,
    origem: "site",
  }).select("id").single();
  if (error || !nova) return NextResponse.json({ erro: "Não consegui registrar. Tente de novo ou nos chame no WhatsApp." }, { status: 500 });

  // MAR-07: duas pessoas no último lugar ao mesmo tempo passavam as duas.
  // Confere de novo DEPOIS de gravar; se passou do limite, desfaz a sua.
  const { data: depois } = await supabase
    .from("reservas")
    .select("pessoas")
    .eq("empresa_id", empresaId)
    .eq("data", data)
    .eq("turno", turno)
    .neq("status", "cancelada");
  const linhas = (depois as { pessoas: number }[]) ?? [];
  const totalPessoas = linhas.reduce((s, r) => s + (Number(r.pessoas) || 0), 0);
  if (totalPessoas > limite.max_pessoas || linhas.length > limite.max_reservas) {
    await supabase.from("reservas").delete().eq("id", (nova as { id: string }).id);
    return NextResponse.json(
      { erro: "As mesas desse horário acabaram de ser tomadas. Escolha outro dia ou nos chame no WhatsApp." },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true, status });
}
