import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { exigirAcesso } from "@/lib/permissoes-server";
import { hojeSP } from "@/lib/assiduidade-server";
import { aniversarioBR } from "@/lib/equipe";
import { duracao } from "@/lib/ponto-relatorio-core";
import { DIAS_SEMANA, minutosDoDia, ORDEM_DIAS, periodosDoDia, resumoHorario, totalSemana, type HorarioPonto } from "@/lib/ponto-horarios-core";
import { CAMPOS_GERAIS, CAMPOS_PESSOAIS, diasAte } from "@/lib/ficha-core";
import { AbaCampos, CargosAba, DemissaoAba, DocumentosAba, HorarioAba, type Documento, type Opcao } from "./ficha";

export const metadata = { title: "Ficha do funcionário" };
export const dynamic = "force-dynamic";

const ABAS = [
  ["geral", "Informações gerais"], ["pessoais", "Dados pessoais"], ["horario", "Horário"],
  ["cargos", "Cargos"], ["demissao", "Demissão"], ["documentos", "Documentos"],
] as const;
type Aba = (typeof ABAS)[number][0];
const dmy = (d: string | null | undefined) => (d ? `${String(d).slice(8, 10)}/${String(d).slice(5, 7)}/${String(d).slice(0, 4)}` : "");

// FICHA DO FUNCIONÁRIO (migration 0257), em abas como o "Editar Funcionário"
// do RHiD. O cadastro rápido (janela da lista) continua pro dia a dia.
export default async function FichaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string }> }) {
  await exigirAcesso("/colaboradores");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { aba: abaParam } = await searchParams;
  const aba: Aba = (ABAS.find(([k]) => k === abaParam)?.[0] ?? "geral") as Aba;
  const supabase = await createClient();
  const hoje = hojeSP();

  const { data: c } = await supabase.from("colaboradores").select("*").eq("id", id).maybeSingle();
  if (!c) notFound();
  const col = c as Record<string, unknown> & { id: string; nome: string; ativo: boolean; bate_ponto: boolean; whatsapp: string | null; departamento_id: string | null; cargo_id: string | null; superior_id: string | null; motivo_demissao_id: string | null; desligado_em: string | null; desligado_motivo: string | null; admissao: string | null; nascimento: string | null; matricula: string | null; funcao: string | null };

  const [{ data: deps }, { data: cargos }, { data: motivos }, { data: pessoas }] = await Promise.all([
    supabase.from("departamentos").select("id, nome, ativo").order("nome"),
    supabase.from("cargos").select("id, nome, ativo").order("nome"),
    supabase.from("motivos_demissao").select("id, nome, ativo").order("nome"),
    supabase.from("colaboradores").select("id, nome").eq("ativo", true).neq("id", id).order("nome"),
  ]);
  const ativosOuAtual = (l: { id: string; nome: string; ativo: boolean }[] | null, atual: string | null): Opcao[] =>
    (l ?? []).filter((x) => x.ativo || x.id === atual).map((x) => ({ id: x.id, nome: x.nome }));
  const nomeDe = (l: { id: string; nome: string }[] | null, x: string | null) => (l ?? []).find((y) => y.id === x)?.nome ?? null;
  const cargoNome = nomeDe(cargos, col.cargo_id) ?? col.funcao;
  const depNome = nomeDe(deps, col.departamento_id);

  const valores = (campos: { k: string }[]) => Object.fromEntries(campos.map((f) => [f.k, col[f.k] == null ? "" : String(col[f.k]).slice(0, f.k === "admissao" || f.k.endsWith("validade") ? 10 : 500)]));

  return (
    <div className="w-full max-w-6xl px-4 py-5 md:px-[30px] md:py-[26px]">
      <p className="rotulo"><Link href="/colaboradores" className="hover:text-texto">Colaboradores</Link></p>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-numero text-[30px] font-bold leading-[1.05] tracking-apertada text-texto">{col.nome}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-texto-suave">
            {col.ativo ? <span className="pilula pilula-ok">ativo</span> : <span className="pilula pilula-neutra">desligado em {dmy(col.desligado_em)}</span>}
            {[cargoNome, depNome, col.matricula ? `matrícula ${col.matricula}` : null, col.admissao ? `admissão ${dmy(col.admissao)}` : null].filter(Boolean).join(" · ")}
          </p>
        </div>
        {col.bate_ponto && <Link href={`/colaboradores/ponto?aba=espelho&p=${col.id}`} className="btn-secundario">Espelho de ponto</Link>}
      </div>

      <nav className="mt-4 flex gap-1 overflow-x-auto border-b border-borda text-sm [scrollbar-width:none]" aria-label="Abas da ficha">
        {ABAS.map(([k, r]) => (
          <Link key={k} href={`/colaboradores/${id}?aba=${k}`} aria-current={aba === k ? "page" : undefined}
            className={`-mb-px inline-flex min-h-11 shrink-0 items-center border-b-2 px-3 ${aba === k ? "border-primaria font-semibold text-texto" : "border-transparent text-texto-suave hover:text-texto"}`}>
            {r}
          </Link>
        ))}
      </nav>

      <div className="mt-4">
        {aba === "geral" && (
          <AbaCampos id={id} campos={CAMPOS_GERAIS} valores={valores(CAMPOS_GERAIS)}
            listas={[
              { k: "departamento_id", rotulo: "Departamento", valor: col.departamento_id ?? "", opcoes: ativosOuAtual(deps, col.departamento_id), novo: "/colaboradores/cadastros" },
              { k: "superior_id", rotulo: "Superior direto", valor: col.superior_id ?? "", opcoes: (pessoas ?? []) as Opcao[] },
            ]}
            extra={<p className="text-sm text-texto-suave">Cargo: <b className="text-texto">{cargoNome ?? "—"}</b> · troca na aba <Link href={`/colaboradores/${id}?aba=cargos`} className="font-semibold text-texto-marca hover:underline">Cargos</Link>. Nome, WhatsApp e pagamento ficam no cadastro rápido da lista.</p>}
          />
        )}
        {aba === "pessoais" && (
          <AbaCampos id={id} campos={[{ k: "nascimento", rotulo: "Data de nascimento", dica: "dd/mm/aaaa (ou só dd/mm)" }, ...CAMPOS_PESSOAIS]}
            valores={{ ...valores(CAMPOS_PESSOAIS), nascimento: aniversarioBR(col.nascimento) }} cep
            extra={<p className="text-sm text-texto-suave">WhatsApp: <b className="text-texto">{col.whatsapp || "—"}</b> (muda no cadastro rápido).</p>}
          />
        )}
        {aba === "horario" && await (async () => {
          const [{ data: vs }, { data: hs }] = await Promise.all([
            supabase.from("colaborador_horarios").select("id, horario_id, de, ate").eq("colaborador_id", id).order("de", { ascending: false }),
            supabase.from("ponto_horarios").select("id, nome, ativo, dias, tolerancia_extra, tolerancia_falta, limite_extra, limite_falta, noturno_inicio, noturno_fim").order("nome"),
          ]);
          const horarios = (hs ?? []) as HorarioPonto[];
          const hist = ((vs ?? []) as { id: string; horario_id: string; de: string; ate: string | null }[]).map((v) => ({ ...v, de: String(v.de).slice(0, 10), ate: v.ate ? String(v.ate).slice(0, 10) : null, nome: horarios.find((h) => h.id === v.horario_id)?.nome ?? "?" }));
          const atual = hist.find((v) => v.de <= hoje && (!v.ate || v.ate >= hoje));
          const h = atual ? horarios.find((x) => x.id === atual.horario_id) : undefined;
          return (
            <div className="grid gap-4">
              {!col.bate_ponto && <p className="cartao p-4 text-sm text-texto-suave">Essa pessoa não está marcada “Bate ponto no relógio”. O horário só conta pra quem bate ponto.</p>}
              {h ? (
                <section className="cartao overflow-x-auto p-4">
                  <p className="rotulo mb-2">Horário atual · <Link href={`/colaboradores/ponto/horarios/${h.id}`} className="hover:text-texto">{h.nome}</Link></p>
                  <table className="w-full min-w-[480px] text-sm">
                    <thead className="rotulo text-left"><tr><th className="py-2">Dia</th><th>Entrada 1</th><th>Saída 1</th><th>Entrada 2</th><th>Saída 2</th><th className="text-right">Total</th></tr></thead>
                    <tbody className="divide-y divide-borda">
                      {ORDEM_DIAS.map((d) => {
                        const p = periodosDoDia(h.dias[String(d)]);
                        return (
                          <tr key={d}><td className="py-1.5 font-semibold text-texto">{DIAS_SEMANA[d]}</td>
                            <td>{p[0]?.[0] ?? ""}</td><td>{p[0]?.[1] ?? ""}</td><td>{p[1]?.[0] ?? ""}</td><td>{p[1]?.[1] ?? ""}</td>
                            <td className="text-right font-numero">{p.length ? duracao(minutosDoDia(h.dias[String(d)])) : <span className="text-texto-fraco">folga</span>}</td></tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="mt-2 text-xs text-texto-suave">{resumoHorario(h)} · {duracao(totalSemana(h))} por semana</p>
                </section>
              ) : <p className="cartao p-4 text-sm text-texto-suave">Sem horário hoje. Escolha abaixo.</p>}
              <HorarioAba id={id} hoje={hoje} historico={hist} horarios={horarios.filter((x) => x.ativo).map((x) => ({ id: x.id, nome: x.nome }))} />
            </div>
          );
        })()}
        {aba === "cargos" && await (async () => {
          const { data: hs } = await supabase.from("colaborador_cargos").select("id, cargo_id, de, ate").eq("colaborador_id", id).order("de", { ascending: false });
          const hist = ((hs ?? []) as { id: string; cargo_id: string; de: string; ate: string | null }[]).map((v) => ({ id: v.id, de: String(v.de).slice(0, 10), ate: v.ate ? String(v.ate).slice(0, 10) : null, nome: nomeDe(cargos, v.cargo_id) ?? "?" }));
          return <CargosAba id={id} hoje={hoje} historico={hist} cargos={ativosOuAtual(cargos, col.cargo_id)} admissao={col.admissao ? String(col.admissao).slice(0, 10) : null} />;
        })()}
        {aba === "demissao" && (
          <DemissaoAba id={id} ativo={col.ativo} data={col.desligado_em ? String(col.desligado_em).slice(0, 10) : hoje}
            motivoId={col.motivo_demissao_id ?? ""} obs={col.desligado_motivo ?? ""} motivos={ativosOuAtual(motivos, col.motivo_demissao_id)} />
        )}
        {aba === "documentos" && await (async () => {
          const { data: ds } = await supabase.from("colaborador_documentos").select("id, nome, tipo, validade, pedir_assinatura, assinado_em, criado_em").eq("colaborador_id", id).order("criado_em", { ascending: false });
          const docs: Documento[] = ((ds ?? []) as Omit<Documento, "dias">[]).map((d) => ({ ...d, validade: d.validade ? String(d.validade).slice(0, 10) : null, dias: d.validade ? diasAte(String(d.validade).slice(0, 10), hoje) : null }));
          return <DocumentosAba id={id} docs={docs} temApp={!!col.ativo} />;
        })()}
      </div>
    </div>
  );
}
