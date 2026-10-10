import { createAdminClient } from "@/lib/supabase/admin";
import { acharPorNome, lerAfd, soDigitos, turnoDaBatida } from "@/lib/ponto-core";

// Recebe as batidas do relógio (via agente do PC central) — migration 0221.
// Liga cada batida a um colaborador pelo CPF; na primeira vez, se o
// colaborador ainda não tem CPF no cadastro, tenta pelo nome cadastrado no
// relógio e grava o CPF. Quem está marcado "bate ponto" ganha a presença do
// turno sozinho; o resto fica só registrado (aparece na tela, não paga).

export async function ultimoNsr(empresaId: string, equipamento: string): Promise<number> {
  const admin = createAdminClient();
  const { data } = await admin.from("ponto_batidas").select("nsr").eq("empresa_id", empresaId).eq("equipamento", equipamento)
    .order("nsr", { ascending: false }).limit(1).maybeSingle();
  return Number((data as { nsr: number } | null)?.nsr ?? 0);
}

export async function receberAfd(
  empresaId: string,
  equipamento: string,
  afd: string,
  usuarios: { cpf: string; nome: string }[],
  origem: "relogio" | "afd" = "relogio",
) {
  const admin = createAdminClient();
  const batidas = lerAfd(afd);
  if (batidas.length === 0) return { recebidas: 0, novas: 0, presencas: 0, semColaborador: 0 };

  // Colaboradores da empresa (ativos e inativos: a batida antiga de quem saiu ainda é dele).
  const { data: cols } = await admin.from("colaboradores").select("id, nome, cpf, bate_ponto, ativo").eq("empresa_id", empresaId);
  const colaboradores = (cols ?? []) as { id: string; nome: string; cpf: string | null; bate_ponto: boolean; ativo: boolean }[];
  const porCpf = new Map(colaboradores.filter((c) => soDigitos(c.cpf).length === 11).map((c) => [soDigitos(c.cpf), c]));
  const nomeDoCpf = new Map(usuarios.map((u) => [soDigitos(u.cpf).slice(-11), (u.nome || "").trim()]));

  // CPF novo: tenta ligar pelo nome (só entre ativos sem CPF) e grava no cadastro.
  for (const cpf of new Set(batidas.map((b) => b.cpf))) {
    if (porCpf.has(cpf)) continue;
    const nome = nomeDoCpf.get(cpf);
    if (!nome) continue;
    const semCpf = colaboradores.filter((c) => c.ativo && soDigitos(c.cpf).length !== 11);
    const achado = acharPorNome(nome, semCpf);
    if (!achado) continue;
    await admin.from("colaboradores").update({ cpf }).eq("id", achado.id);
    achado.cpf = cpf;
    porCpf.set(cpf, achado);
  }

  // A mesma batida pode chegar por dois caminhos (relógio pelo agente e AFD
  // importado do RHiD, com NSR diferente): pessoa + hora igual = repetida.
  const horas = batidas.map((b) => new Date(b.dataHora).getTime());
  const { data: jaTem } = await admin.from("ponto_batidas").select("cpf, data_hora").eq("empresa_id", empresaId)
    .gte("data_hora", new Date(Math.min(...horas)).toISOString()).lte("data_hora", new Date(Math.max(...horas)).toISOString()).limit(50000);
  const existe = new Set(((jaTem ?? []) as { cpf: string; data_hora: string }[]).map((x) => `${x.cpf}|${new Date(x.data_hora).getTime()}`));
  const vistas = new Set<string>();
  const unicas = batidas.filter((b) => {
    const k = `${b.cpf}|${new Date(b.dataHora).getTime()}`;
    if (existe.has(k) || vistas.has(k)) return false;
    vistas.add(k);
    return true;
  });
  if (unicas.length === 0) return { recebidas: batidas.length, novas: 0, presencas: 0, semColaborador: 0 };

  const linhas = unicas.map((b) => {
    const { data, turno } = turnoDaBatida(b.dataHora);
    const c = porCpf.get(b.cpf) ?? null;
    return {
      empresa_id: empresaId, equipamento, nsr: b.nsr, data_hora: new Date(b.dataHora).toISOString(),
      cpf: b.cpf, nome: nomeDoCpf.get(b.cpf) || c?.nome || null, colaborador_id: c?.id ?? null, data, turno, origem,
    };
  });
  const { data: novas, error } = await admin.from("ponto_batidas")
    .upsert(linhas, { onConflict: "empresa_id,equipamento,nsr", ignoreDuplicates: true })
    .select("id, colaborador_id, data, turno");
  if (error) throw new Error(error.message);
  const inseridas = (novas ?? []) as { id: string; colaborador_id: string | null; data: string; turno: string }[];

  // Presença: só de quem bate ponto, uma por dia e turno.
  const batePonto = new Set(colaboradores.filter((c) => c.bate_ponto).map((c) => c.id));
  const presencas = new Map<string, { empresa_id: string; colaborador_id: string; data: string; turno: string; origem: string }>();
  for (const b of inseridas) {
    if (!b.colaborador_id || !batePonto.has(b.colaborador_id)) continue;
    presencas.set(`${b.colaborador_id}|${b.data}|${b.turno}`, { empresa_id: empresaId, colaborador_id: b.colaborador_id, data: b.data, turno: b.turno, origem: "ponto" });
  }
  if (presencas.size) {
    await admin.from("presencas").upsert([...presencas.values()], { onConflict: "colaborador_id,data,turno", ignoreDuplicates: true });
    await admin.from("ponto_batidas").update({ presenca: true })
      .in("id", inseridas.filter((b) => b.colaborador_id && batePonto.has(b.colaborador_id)).map((b) => b.id));
  }
  return {
    recebidas: batidas.length,
    novas: inseridas.length,
    presencas: presencas.size,
    semColaborador: inseridas.filter((b) => !b.colaborador_id).length,
  };
}
