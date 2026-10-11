import { createClient } from "@/lib/supabase/server";
import { diasDaSemana, segundaDe, somarDias } from "@/lib/equipe";
import { hojeSP } from "@/lib/etiqueta-vencimentos";
import { SemanaClient, type Pessoa } from "./semana";

export const dynamic = "force-dynamic";

export default async function SemanaPage({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const { s } = await searchParams;
  const segunda = segundaDe(/^\d{4}-\d{2}-\d{2}$/.test(s ?? "") ? (s as string) : hojeSP());
  const dias = diasDaSemana(segunda);
  const fim = somarDias(segunda, 6);

  const supabase = await createClient();
  const [{ data: colabs }, { data: dez }, { data: pagos }, { data: fiado }, { data: extras }, { data: adiantamentos }] = await Promise.all([
    supabase
      .from("colaboradores")
      .select("id, nome, turno, vinculo, vinculo_noite, funcao, valor_dia, valor_noite, salario_base, recebe_10, peso_10, esporadico, ativo, bate_ponto")
      .eq("ativo", true)
      .order("nome"),
    // 10%: noites pagas NESTA semana (normalmente da semana passada) + noites desta semana (pagas na próxima).
    supabase
      .from("dez_por_cento_noites")
      .select("data, valor, pagar_em")
      .or(`pagar_em.eq.${segunda},and(data.gte.${segunda},data.lte.${fim})`)
      .order("data"),
    supabase.from("semana_pagamentos").select("colaborador_id, valor, lancamento_id, desconto").eq("segunda", segunda),
    // Fiado em aberto (compras internas) — pra poder descontar no acerto.
    supabase.from("retiradas").select("colaborador_id, valor").eq("status", "aberto").limit(5000),
    supabase.from("semana_extras").select("colaborador_id, valor, motivo, turno, desconto, desconto_motivo").eq("segunda", segunda),
    // Adiantamentos ainda não descontados — saem no próximo acerto lançado.
    supabase.from("adiantamentos").select("id, colaborador_id, nome, valor, data, motivo").eq("status", "aberto").order("data"),
  ]);

  // Presenças da semana + das noites de 10% que entram neste acerto (podem ser de outra semana).
  const datasExtras = ((dez ?? []) as { data: string }[]).map((d) => d.data).filter((d) => d < segunda || d > fim);
  const [{ data: presSemana }, { data: presExtras }] = await Promise.all([
    supabase.from("presencas").select("colaborador_id, data, turno").gte("data", segunda).lte("data", fim),
    datasExtras.length
      ? supabase.from("presencas").select("colaborador_id, data, turno").in("data", datasExtras)
      : Promise.resolve({ data: [] as { colaborador_id: string; data: string; turno: string }[] }),
  ]);

  // Quem trabalhou numa noite de 10% e depois foi DESATIVADO continua na divisão
  // daquela noite. Sem isso, desativar alguém (ex.: Giovana, 10/2026) fazia a
  // parte dela "sobrar" pros outros e aparecia "Lançar diferença" em todo mundo
  // de uma semana já paga — pagando a parte dela duas vezes.
  const noites10 = new Set(((dez ?? []) as { data: string }[]).map((d) => String(d.data).slice(0, 10)));
  const ativos = new Set(((colabs ?? []) as { id: string }[]).map((c) => c.id));
  const idsInativos = [...new Set(
    ([...(presSemana ?? []), ...(presExtras ?? [])] as { colaborador_id: string; data: string; turno: string }[])
      .filter((p) => p.turno === "noite" && noites10.has(String(p.data).slice(0, 10)) && !ativos.has(p.colaborador_id))
      .map((p) => p.colaborador_id),
  )];
  const { data: inativos } = idsInativos.length
    ? await supabase.from("colaboradores").select("id, peso_10").in("id", idsInativos).eq("recebe_10", true)
    : { data: [] as { id: string; peso_10: number | null }[] };

  // Relógio de ponto (migration 0221): horários de cada um na semana + batidas
  // de quem ainda não está ligado a um colaborador (CPF não cadastrado).
  const { data: batRows } = await supabase
    .from("ponto_batidas")
    .select("colaborador_id, data, turno, data_hora, cpf, nome")
    .gte("data", segunda)
    .lte("data", fim)
    .order("data_hora")
    .limit(5000);
  const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  type Bat = { colaborador_id: string | null; data: string; turno: "dia" | "noite"; data_hora: string; cpf: string; nome: string | null };
  const batidas = (batRows ?? []) as Bat[];
  const batidasPonto = batidas.filter((b) => b.colaborador_id).map((b) => ({ colaborador_id: b.colaborador_id as string, data: String(b.data).slice(0, 10), turno: b.turno, hora: hhmm(b.data_hora) }));
  const semPessoa = new Map<string, { nome: string | null; cpf: string; n: number }>();
  for (const b of batidas.filter((x) => !x.colaborador_id)) {
    const s = semPessoa.get(b.cpf) ?? { nome: b.nome, cpf: b.cpf, n: 0 };
    s.n++;
    semPessoa.set(b.cpf, s);
  }

  // "Bate ponto" = carteira assinada: sem diária no turno do dia (src/lib/equipe.ts).
  // Vale a partir da semana em que o ponto começou (assiduidade_config.inicio,
  // 12/10/2026); as semanas antes disso seguem calculando como foram pagas.
  const { data: cfgPonto } = await supabase.from("assiduidade_config").select("inicio").maybeSingle();
  const inicioPonto = String((cfgPonto as { inicio: string | null } | null)?.inicio ?? "9999-12-31").slice(0, 10);
  const pessoasDaSemana = ((colabs ?? []) as Pessoa[]).map((c) => ({ ...c, bate_ponto: !!c.bate_ponto && fim >= inicioPonto }));

  const fiadoPor: Record<string, { valor: number; n: number }> = {};
  for (const r of (fiado ?? []) as { colaborador_id: string | null; valor: number }[]) {
    if (!r.colaborador_id) continue;
    const f = (fiadoPor[r.colaborador_id] ??= { valor: 0, n: 0 });
    f.valor += Number(r.valor) || 0;
    f.n++;
  }

  return (
    <SemanaClient
      key={segunda}
      segunda={segunda}
      dias={dias}
      pessoas={pessoasDaSemana}
      presencasIniciais={[...(presSemana ?? []), ...(presExtras ?? [])] as { colaborador_id: string; data: string; turno: "dia" | "noite" }[]}
      dezIniciais={(dez ?? []) as { data: string; valor: number; pagar_em: string }[]}
      pagos={(pagos ?? []) as { colaborador_id: string; valor: number; lancamento_id: string | null; desconto: number }[]}
      fiadoPor={fiadoPor}
      extrasIniciais={(extras ?? []) as { colaborador_id: string; valor: number; motivo: string | null; turno: "dia" | "noite"; desconto: number; desconto_motivo: string | null }[]}
      adiantamentos={(adiantamentos ?? []) as { id: string; colaborador_id: string; nome: string; valor: number; data: string; motivo: string | null }[]}
      inativos10={(inativos ?? []) as { id: string; peso_10: number | null }[]}
      batidasPonto={batidasPonto}
      pontoSemPessoa={[...semPessoa.values()]}
    />
  );
}
