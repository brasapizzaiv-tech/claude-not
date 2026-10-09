import { createClient } from "@/lib/supabase/server";
import { exigirAcesso } from "@/lib/permissoes-server";
import { Icone } from "@/components/icone";
import { ehPara, lerLembrete, resumoQuando, valeNoDia, ATRASADO_ATE_DIAS, type Lembrete } from "@/lib/lembretes-core";
import { hojeSP } from "@/lib/lembretes-server";
import { LembretesClient, type LinhaLembrete } from "./client";

export const metadata = { title: "Lembretes · Brasa" };
export const dynamic = "force-dynamic";

// LEMBRETES PRA EQUIPE (migration 0218)
//
// A gestão escreve aqui; cada pessoa vê no app dela (/eu/{token}) no dia certo
// e toca em "Visto" ou "Feito". Esta tela responde a pergunta de sempre:
// "todo mundo viu?" — por isso o lembrete de hoje mostra quem falta, pelo nome.
function diasAtras(dia: string, n: number) {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d - n)).toISOString().slice(0, 10);
}

export default async function LembretesPage() {
  await exigirAcesso("/lembretes");
  const supabase = await createClient();
  const hoje = hojeSP();
  const limite = diasAtras(hoje, ATRASADO_ATE_DIAS);

  const [{ data: ls }, { data: setRows }, { data: colRows }, { data: confRows }] = await Promise.all([
    supabase.from("lembretes").select("*").order("criado_em", { ascending: false }),
    supabase.from("checklist_setores").select("id, nome").eq("ativo", true).order("ordem"),
    supabase.from("colaboradores").select("id, nome, checklist_setores, pin, ativo").eq("ativo", true).order("nome"),
    supabase.from("lembrete_confirmacoes").select("lembrete_id, colaborador_id, dia, confirmado_em").gte("dia", limite),
  ]);
  const lembretes = ((ls ?? []) as Record<string, unknown>[]).map(lerLembrete);
  const setores = ((setRows ?? []) as { id: string; nome: string }[]);
  const todos = ((colRows ?? []) as { id: string; nome: string; checklist_setores: string[] | null; pin: string | null }[]);
  // Só conta quem já usa o app (tem PIN). Quem nunca entrou não tem como ver,
  // e listar como "falta" só ia fazer barulho.
  const usamApp = todos.filter((c) => !!c.pin).map((c) => ({ id: c.id, nome: c.nome, setores: c.checklist_setores ?? [] }));
  const nomeSetor = new Map(setores.map((s) => [s.id, s.nome]));
  const nomeColab = new Map(todos.map((c) => [c.id, c.nome]));
  const conf = new Map<string, string>();
  for (const c of (confRows ?? []) as { lembrete_id: string; colaborador_id: string; dia: string; confirmado_em: string }[]) {
    conf.set(`${c.lembrete_id}|${c.colaborador_id}|${c.dia}`, c.confirmado_em);
  }

  const paraTexto = (l: Lembrete) =>
    l.para === "todos" ? "Todos"
      : l.para === "setores" ? l.setorIds.map((s) => nomeSetor.get(s) ?? "setor apagado").join(", ")
        : l.colaboradorIds.map((c) => nomeColab.get(c) ?? "pessoa saiu").join(", ");

  const linhas: LinhaLembrete[] = lembretes.map((l) => {
    const atrasado = l.ativo && l.repeticao === "uma_vez" && l.data < hoje && l.data >= limite;
    const valeHoje = valeNoDia(l, hoje) || atrasado;
    let situacao: LinhaLembrete["situacao"] = null;
    if (valeHoje) {
      const dia = l.repeticao === "uma_vez" ? l.data : hoje;
      const destino = usamApp.filter((p) => ehPara(l, p));
      const confirmados = destino.filter((p) => conf.has(`${l.id}|${p.id}|${dia}`))
        .map((p) => ({ nome: p.nome, em: conf.get(`${l.id}|${p.id}|${dia}`)! }));
      const pendentes = destino.filter((p) => !conf.has(`${l.id}|${p.id}|${dia}`)).map((p) => p.nome);
      situacao = { dia, confirmados, pendentes };
    }
    return { lembrete: l, quando: resumoQuando(l), para: paraTexto(l), situacao, futuro: l.ativo && l.data > hoje };
  });

  return (
    <div className="w-full max-w-4xl p-4">
      <h1 className="flex items-center gap-2 text-xl font-bold"><Icone nome="sino" tamanho={19} /> Lembretes pra equipe</h1>
      <p className="mb-5 text-sm text-texto-suave">
        Aparece no app de cada pessoa no dia marcado, com um botão de Visto ou Feito. Aqui você vê quem ainda não confirmou.
      </p>
      <LembretesClient
        linhas={linhas}
        hoje={hoje}
        setores={setores}
        pessoas={todos.map((c) => ({ id: c.id, nome: c.nome, usaApp: !!c.pin }))}
      />
    </div>
  );
}
