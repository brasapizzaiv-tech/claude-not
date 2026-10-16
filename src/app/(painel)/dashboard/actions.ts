"use server";

import { createClient } from "@/lib/supabase/server";

// Busca do topo da tela inicial: "Buscar mesa, comanda, cliente…".
//   12      → a mesa 12 (a comanda aberta dela, se tiver)
//   #318    → a comanda 318 aberta (ou a mesa, se não achar comanda)
//   texto   → a lista de clientes já filtrada
export async function buscarRapido(termo: string): Promise<{ href: string }> {
  const q = (termo || "").trim();
  if (!q) return { href: "/dashboard" };
  const so = q.replace(/^#/, "");
  if (/^\d{1,5}$/.test(so)) {
    const n = Number(so);
    const supabase = await createClient();
    const { data: abertas } = await supabase.from("pdv_comandas").select("id, numero, mesa").eq("status", "aberta");
    const lista = (abertas as { id: string; numero: number; mesa: string | null }[]) ?? [];
    const daMesa = lista.find((c) => Number(String(c.mesa ?? "").replace(/\D/g, "")) === n);
    const daComanda = lista.find((c) => c.numero === n);
    // "#" na frente = a pessoa quis dizer comanda; sem "#", mesa primeiro.
    const achada = q.startsWith("#") ? daComanda ?? daMesa : daMesa ?? daComanda;
    if (achada) return { href: `/salao/comandas/${achada.id}` };
    return { href: `/salao/mesa/${n}` };
  }
  return { href: `/clientes?q=${encodeURIComponent(q.slice(0, 80))}` };
}
