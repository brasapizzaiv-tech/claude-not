import { createClient } from "@/lib/supabase/server";
import { EditorCardapio, type Cardapio } from "./editor";

// Hoje no fuso de Brasília (UTC−3, sem horário de verão).
function hojeBR() {
  return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}
function addDias(iso: string, n: number) {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
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
  const { data } = await supabase
    .from("cardapio_dia")
    .select("*")
    .gte("data", addDias(hoje, -7))
    .lte("data", addDias(hoje, 21))
    .order("data");
  const dias = (data as Cardapio[]) ?? [];

  return (
    <EditorCardapio
      key={dia}
      dia={dia}
      hoje={hoje}
      dias={dias}
      atual={dias.find((c) => c.data === dia) ?? null}
    />
  );
}
