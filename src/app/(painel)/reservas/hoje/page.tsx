import { createClient } from "@/lib/supabase/server";
import { ReservasHoje, type ResMobile } from "./mobile";

function hojeBR() {
  return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

export default async function ReservasHojePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const hoje = hojeBR();
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(sp.dia ?? "") ? sp.dia : hoje;

  const supabase = await createClient();
  const { data } = await supabase
    .from("reservas")
    .select("id, nome, telefone, turno, pessoas, adultos, criancas, mesa, ocasiao, observacao, status, chegou_em")
    .eq("data", dia)
    .neq("status", "cancelada")
    .order("turno")
    .order("criado_em");

  const reservas = (data as ResMobile[]) ?? [];
  return <ReservasHoje dia={dia} hoje={hoje} reservas={reservas} />;
}
