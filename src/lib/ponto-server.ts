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

  const presencas = await marcarPresencasDoPonto(empresaId, inseridas.filter((b) => b.colaborador_id).map((b) => ({ colaboradorId: b.colaborador_id as string, data: String(b.data).slice(0, 10) })));
  return {
    recebidas: batidas.length,
    novas: inseridas.length,
    presencas,
    semColaborador: inseridas.filter((b) => !b.colaborador_id).length,
  };
}

/**
 * Marca a presença dos dias tocados por batidas novas. Regras:
 *  - só quem está "bate ponto";
 *  - só a partir de quando o ponto vale (assiduidade_config.inicio): o relógio
 *    manda o histórico inteiro e batida antiga não pode mexer em semana paga;
 *  - o turno vem da ENTRADA (batidas na posição 1, 3, 5... do dia), não de
 *    cada batida: a saída das 18:05 de quem entrou 07:55 é do turno do dia.
 * Nunca apaga presença (quem tira é a gestão, no Semana e 10%).
 */
export async function marcarPresencasDoPonto(empresaId: string, dias: { colaboradorId: string; data: string }[]): Promise<number> {
  if (!dias.length) return 0;
  const admin = createAdminClient();
  const { data: cfgP } = await admin.from("assiduidade_config").select("inicio").eq("empresa_id", empresaId).maybeSingle();
  const inicio = (cfgP as { inicio: string | null } | null)?.inicio ? String((cfgP as { inicio: string }).inicio).slice(0, 10) : "9999-12-31";
  const alvo = dias.filter((d) => d.data >= inicio);
  if (!alvo.length) return 0;
  const ids = [...new Set(alvo.map((d) => d.colaboradorId))];
  const { data: cols } = await admin.from("colaboradores").select("id").in("id", ids).eq("bate_ponto", true);
  const batem = new Set(((cols ?? []) as { id: string }[]).map((c) => c.id));
  const datas = [...new Set(alvo.map((d) => d.data))];
  const { data: bats } = await admin.from("ponto_batidas").select("id, colaborador_id, data, data_hora")
    .in("colaborador_id", [...batem]).in("data", datas).eq("desconsiderada", false).order("data_hora");
  const porDia = new Map<string, { id: string; data_hora: string }[]>();
  for (const b of (bats ?? []) as { id: string; colaborador_id: string; data: string; data_hora: string }[]) {
    const k = `${b.colaborador_id}|${String(b.data).slice(0, 10)}`;
    porDia.set(k, [...(porDia.get(k) ?? []), b]);
  }
  const pres = new Map<string, { empresa_id: string; colaborador_id: string; data: string; turno: string; origem: string }>();
  const marcadas: string[] = [];
  for (const [k, lista] of porDia) {
    const [colaboradorId, data] = k.split("|");
    lista.forEach((b, i) => {
      if (i % 2 !== 0) return; // saída: fica no turno da entrada
      const { turno } = turnoDaBatida(new Date(b.data_hora).toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }).replace(" ", "T") + "-03:00");
      // Entrada de madrugada (antes das 5h) que ficou neste dia é da noite.
      pres.set(`${colaboradorId}|${data}|${turno}`, { empresa_id: empresaId, colaborador_id: colaboradorId, data, turno, origem: "ponto" });
    });
    marcadas.push(...lista.map((b) => b.id));
  }
  if (pres.size) {
    await admin.from("presencas").upsert([...pres.values()], { onConflict: "colaborador_id,data,turno", ignoreDuplicates: true });
    await admin.from("ponto_batidas").update({ presenca: true }).in("id", marcadas);
  }
  return pres.size;
}
