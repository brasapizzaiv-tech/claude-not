import { createClient } from "@/lib/supabase/server";
import { AgendaReservas, type Reserva, type Bloqueio, type Limite } from "./agenda";

// Hoje no fuso de Brasília (UTC−3, sem horário de verão).
function hojeBR() {
  return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

// Agenda de reservas do salão. O site público grava por /api/reservas; aqui a
// equipe confirma, remarca, bloqueia datas e lança reserva de quem ligou.
export default async function ReservasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const hoje = hojeBR();
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(sp.dia ?? "") ? sp.dia : hoje;
  const daqui15 = new Date(new Date(hoje).getTime() + 15 * 864e5)
    .toISOString()
    .slice(0, 10);

  const supabase = await createClient();
  const [{ data: doDia }, { data: proximas }, { data: bloqs }, { data: lims }, { data: cfg }] =
    await Promise.all([
      supabase
        .from("reservas")
        .select("*")
        .eq("data", dia)
        .order("turno")
        .order("criado_em"),
      supabase
        .from("reservas")
        .select("data, turno, pessoas, status")
        .gte("data", hoje)
        .lte("data", daqui15)
        .neq("status", "cancelada"),
      supabase
        .from("reservas_bloqueios")
        .select("*")
        .gte("data", hoje)
        .order("data"),
      supabase.from("reservas_limites").select("*"),
      supabase.from("reservas_config").select("*"),
    ]);

  const mensagens = Object.fromEntries(
    ((cfg as { chave: string; valor: string | null }[]) ?? []).map((c) => [
      c.chave,
      c.valor ?? "",
    ]),
  );

  return (
    <AgendaReservas
      dia={dia}
      hoje={hoje}
      reservas={(doDia as Reserva[]) ?? []}
      proximas={
        (proximas as { data: string; turno: string; pessoas: number }[]) ?? []
      }
      bloqueios={(bloqs as Bloqueio[]) ?? []}
      limites={(lims as Limite[]) ?? []}
      mensagens={mensagens}
    />
  );
}
