"use server";

// Planilha das notas fiscais com os filtros da tela — TODAS as que batem, não
// só a página que está aberta (até 20 mil, em páginas de 1000).
import { createClient } from "@/lib/supabase/server";
import { exigirAcesso } from "@/lib/permissoes-server";
import { consultarNotas, type FiltroNotas } from "./consulta";

export async function notasParaPlanilha(filtro: FiltroNotas) {
  await exigirAcesso(["/salao", "/pdv", "/delivery"]);
  const supabase = await createClient();
  const todas = [];
  for (let p = 0; p < 20; p++) {
    const { linhas } = await consultarNotas(supabase, filtro, p, 1000);
    todas.push(...linhas);
    if (linhas.length < 1000) break;
  }
  return todas;
}
