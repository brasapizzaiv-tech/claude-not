import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

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

// O site consulta o dia escolhido: turnos fechados e quanto já está ocupado.
export async function GET(req: NextRequest) {
  const data = req.nextUrl.searchParams.get("data") ?? "";
  const supabase = createAdminClient();

  const { data: limData } = await supabase.from("reservas_limites").select("*");
  const limites = Object.fromEntries(
    ((limData as { turno: string }[]) ?? []).map((l) => [l.turno, l]),
  );
  if (!ehData(data)) return NextResponse.json({ limites, bloqueios: [], lotacao: {} });

  const [{ data: bloqData }, { data: resData }] = await Promise.all([
    supabase.from("reservas_bloqueios").select("turno, motivo").eq("data", data),
    supabase
      .from("reservas")
      .select("turno, pessoas")
      .eq("data", data)
      .neq("status", "cancelada"),
  ]);

  const lotacao: Record<string, { reservas: number; pessoas: number }> = {};
  for (const r of (resData as { turno: string; pessoas: number }[]) ?? []) {
    const l = (lotacao[r.turno] ??= { reservas: 0, pessoas: 0 });
    l.reservas++;
    l.pessoas += Number(r.pessoas) || 0;
  }

  return NextResponse.json({
    limites,
    bloqueios: (bloqData as { turno: string; motivo: string | null }[]) ?? [],
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

  const supabase = createAdminClient();

  // Dia (ou turno) fechado pela equipe.
  const { data: bloq } = await supabase
    .from("reservas_bloqueios")
    .select("turno")
    .eq("data", data);
  const fechados = ((bloq as { turno: string }[]) ?? []).map((b) => b.turno);
  if (fechados.includes("Dia todo") || fechados.includes(turno))
    return NextResponse.json(
      { erro: "Esse horário está fechado para reservas." },
      { status: 409 },
    );

  // Lotação do turno.
  const [{ data: limData }, { data: doDia }] = await Promise.all([
    supabase.from("reservas_limites").select("*").eq("turno", turno).maybeSingle(),
    supabase
      .from("reservas")
      .select("pessoas")
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

  const { error } = await supabase.from("reservas").insert({
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
  });
  if (error) return NextResponse.json({ erro: "Não consegui registrar." }, { status: 500 });

  return NextResponse.json({ ok: true, status });
}
