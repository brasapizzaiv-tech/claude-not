import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Icone, type NomeIcone } from "@/components/icone";
import type { ModuloKey } from "@/lib/permissoes";

// TELA INICIAL DE QUEM NÃO TEM SALÃO (19/11/2026).
//
// A tela inicial de sempre (inicio.tsx) é a de um restaurante: mesas, caixa,
// delivery. Uma empresa que contratou só Compras e estoque + Equipe (a primeira
// de fora, uma hamburgueria) abria uma tela de zeros. Esta mostra o dia dela:
// o que chega hoje, as cotações esperando fornecedor, a equipe.
//
// Mesmo desenho do painel (CLAUDE.md, "Layout do painel"): um cartão de foco,
// número importante em pêssego, laranja forte só no botão principal.

const TITULO = "font-numero font-bold tracking-apertada text-texto";

type Pendencia = { rotulo: string; nota: string; urgente: boolean; href: string };

export async function InicioGestao({
  nome, saudacao, diaLegivel, dia, turno, empresaId, pode,
}: {
  nome: string;
  saudacao: string;
  diaLegivel: string;
  dia: string;
  /** Antes das 17h, o turno do dia; depois, o da noite (quem calcula é a página). */
  turno: "dia" | "noite";
  empresaId: string | null;
  pode: (k: ModuloKey) => boolean;
}) {
  const supabase = await createClient();
  const vazio = { data: null, count: 0 };

  const [chegam, cotEsperando, cotAbertas, contagemAberta, folgas, compras, checklists] = await Promise.all([
    // Pedidos que a equipe confere hoje (o mesmo filtro do aviso da manhã).
    pode("conferencia") || pode("cotacoes")
      ? supabase
          .from("pedidos")
          .select("id, dia_entrega:pedido_dia_entrega, fornecedores(nome)")
          .eq("cobrar_conf", true).is("conf_colab_em", null).is("nao_veio_em", null).is("aviso_encerrado_em", null)
          .in("status", ["rascunho", "enviado"])
      : Promise.resolve(vazio),
    pode("cotacoes")
      ? supabase.from("cotacao_fornecedores").select("id, cotacoes!inner(status)", { count: "exact", head: true })
          .eq("status", "enviado").eq("cotacoes.status", "aberta")
      : Promise.resolve(vazio),
    pode("cotacoes")
      ? supabase.from("cotacoes").select("id", { count: "exact", head: true }).eq("status", "aberta")
      : Promise.resolve(vazio),
    pode("contagem")
      ? supabase.from("contagens").select("id", { count: "exact", head: true }).neq("status", "finalizada")
      : Promise.resolve(vazio),
    pode("folgas")
      ? supabase.from("folgas_pedidos").select("id", { count: "exact", head: true }).eq("status", "Pendente")
      : Promise.resolve(vazio),
    pode("solicitacoes")
      ? supabase.from("solicitacoes_compra").select("id", { count: "exact", head: true }).eq("status", "pendente")
      : Promise.resolve(vazio),
    pode("checklists")
      ? supabase.from("checklist_execucoes").select("id", { count: "exact", head: true }).eq("data", dia).is("concluido_em", null)
      : Promise.resolve(vazio),
  ]);

  type Ped = { id: string; dia_entrega: string | null; fornecedores: { nome: string } | { nome: string }[] | null };
  const hoje = ((chegam.data as Ped[] | null) ?? []).filter((p) => String(p.dia_entrega ?? "").slice(0, 10) === dia);
  const atrasados = ((chegam.data as Ped[] | null) ?? []).filter((p) => p.dia_entrega && String(p.dia_entrega).slice(0, 10) < dia);
  const nomeForn = (p: Ped) => (Array.isArray(p.fornecedores) ? p.fornecedores[0]?.nome : p.fornecedores?.nome) ?? "Fornecedor";

  // Quem está na casa: presença lançada ou ponto batido no turno (como na outra tela).
  let pessoas: string[] = [];
  if (pode("colaboradores") && empresaId) {
    const admin = createAdminClient();
    const [{ data: pres }, { data: bat }] = await Promise.all([
      admin.from("presencas").select("colaborador_id").eq("empresa_id", empresaId).eq("data", dia).eq("turno", turno),
      admin.from("ponto_batidas").select("colaborador_id").eq("empresa_id", empresaId).eq("data", dia).eq("turno", turno)
        .eq("desconsiderada", false).not("colaborador_id", "is", null),
    ]);
    const ids = [...new Set([...(pres ?? []), ...(bat ?? [])].map((r) => r.colaborador_id as string))];
    if (ids.length) {
      const { data: cs } = await supabase.from("colaboradores").select("nome").in("id", ids);
      pessoas = ((cs as { nome: string }[] | null) ?? []).map((c) => c.nome.split(" ")[0]).sort();
    }
  }

  const n = (r: { count: number | null }) => r.count ?? 0;
  const pend: Pendencia[] = [];
  if (atrasados.length) pend.push({ rotulo: atrasados.length === 1 ? "Uma entrega passou do dia e não foi conferida" : `${atrasados.length} entregas passaram do dia sem conferência`, nota: "entrega", urgente: true, href: "/conferencia" });
  if (n(checklists)) pend.push({ rotulo: n(checklists) === 1 ? "Checklist de hoje ainda não foi concluído" : `${n(checklists)} checklists de hoje não foram concluídos`, nota: "checklist", urgente: true, href: "/checklists" });
  if (n(folgas)) pend.push({ rotulo: n(folgas) === 1 ? "Um pedido de folga espera resposta" : `${n(folgas)} pedidos de folga esperam resposta`, nota: "folgas", urgente: false, href: "/folgas" });
  if (n(compras)) pend.push({ rotulo: n(compras) === 1 ? "A equipe pediu uma compra ou manutenção" : `A equipe pediu ${n(compras)} compras ou manutenções`, nota: "equipe", urgente: false, href: "/solicitacoes" });
  if (n(cotEsperando)) pend.push({ rotulo: n(cotEsperando) === 1 ? "Um fornecedor ainda não respondeu a cotação" : `${n(cotEsperando)} fornecedores ainda não responderam`, nota: "cotação", urgente: false, href: "/cotacoes" });
  if (n(contagemAberta)) pend.push({ rotulo: n(contagemAberta) === 1 ? "Uma contagem de estoque está em andamento" : `${n(contagemAberta)} contagens em andamento`, nota: "contagem", urgente: false, href: "/contagens" });

  const blocos: { r: string; v: number; href: string; mostra: boolean }[] = [
    { r: "cotações abertas", v: n(cotAbertas), href: "/cotacoes", mostra: pode("cotacoes") },
    { r: "fornecedores sem resposta", v: n(cotEsperando), href: "/cotacoes", mostra: pode("cotacoes") },
    { r: "folgas pra responder", v: n(folgas), href: "/folgas", mostra: pode("folgas") },
    { r: "pedidos da equipe", v: n(compras), href: "/solicitacoes", mostra: pode("solicitacoes") },
  ].filter((b) => b.mostra);

  type Atalho = { label: string; href: string; icone: NomeIcone; mostra: boolean };
  const atalhos = ([
    { label: "Contagem de estoque", href: "/contagens", icone: "lista", mostra: pode("contagem") },
    { label: "Notas de entrada", href: "/notas", icone: "moedas", mostra: pode("notas") },
    { label: "CMV da semana", href: "/financeiro/cmv", icone: "descendo", mostra: pode("cmv") || pode("financeiro") },
    { label: "Semana da equipe", href: "/colaboradores/semana", icone: "checklist", mostra: pode("colaboradores") },
  ] satisfies Atalho[]).filter((a) => a.mostra) as Atalho[];

  return (
    <div className="pagina flex flex-col gap-[18px]">
      {/* ---------- Topo ---------- */}
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
        <div>
          <p className="rotulo">{diaLegivel}</p>
          <h1 className={`mt-1 text-[30px] leading-[1.05] ${TITULO}`}>{saudacao}, {nome}</h1>
        </div>
        {pode("cotacoes") && (
          <Link href="/cotacoes" className="btn-principal text-sm">
            <Icone nome="novo" tamanho={16} /> Nova cotação
          </Link>
        )}
      </div>

      {/* ---------- Números + cartão de foco (o que chega hoje) ---------- */}
      <div className="grid gap-4 xl:grid-cols-[1fr_330px]">
        <section className="cartao flex flex-col px-5 py-[18px]">
          <h2 className={`text-[17px] ${TITULO}`}>Compras e equipe</h2>
          {blocos.length === 0 ? (
            <p className="mt-3 text-sm text-texto-suave">Nada pra mostrar com os acessos desta conta.</p>
          ) : (
            <div className="mt-3.5 grid grid-cols-2 gap-3 md:grid-cols-4">
              {blocos.map((b, i) => (
                <Link key={b.r} href={b.href} className={`rounded-[16px] px-4 py-3.5 transition hover:opacity-90 ${i === 0 ? "bg-destaque" : "bg-painel-fundo"}`}>
                  <p className="numero-grande text-[38px] leading-none text-texto">{b.v}</p>
                  <p className={`mt-1.5 text-[13px] ${i === 0 ? "font-semibold text-texto-marca-pilula" : "text-texto-suave"}`}>{b.r}</p>
                </Link>
              ))}
            </div>
          )}
        </section>

        <div className="cartao-foco flex min-h-[150px] flex-col px-5 py-[18px]">
          <span className="rotulo !text-painel-foco-rotulo">Chega hoje</span>
          <p className="numero-grande mt-1.5 text-[36px]">
            {hoje.length} {hoje.length === 1 ? "entrega" : "entregas"}
          </p>
          <p className="mt-0.5 text-[12.5px] text-painel-foco-suave">
            {hoje.length ? hoje.slice(0, 4).map(nomeForn).join(", ") + (hoje.length > 4 ? ` e mais ${hoje.length - 4}` : "") : "Nenhum pedido marcado pra hoje."}
          </p>
          {(pode("conferencia") || pode("cotacoes")) && (
            <div className="mt-auto flex gap-2 pt-3">
              <Link href="/conferencia" className="btn-foco min-h-11 flex-1 text-[13.5px]">Ver a conferência</Link>
            </div>
          )}
        </div>
      </div>

      {/* ---------- Rodapé: pendências, atalhos, na casa ---------- */}
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr_1fr]">
        <section className="cartao flex min-w-0 flex-col px-5 py-[18px]">
          <div className="flex items-center justify-between">
            <h2 className={`text-[17px] ${TITULO}`}>Precisa de você</h2>
            {pend.length > 0 && <span className="pilula pilula-urgente-solido">{pend.length}</span>}
          </div>
          {pend.length === 0 ? (
            <p className="mt-3 text-sm text-texto-suave">Nada esperando por você agora.</p>
          ) : (
            <div className="mt-2 flex flex-col">
              {pend.map((p) => (
                <Link key={p.rotulo} href={p.href} className="flex min-h-11 items-center gap-3 border-b border-borda py-2 text-texto last:border-0 hover:opacity-80">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${p.urgente ? "bg-urgente-solido" : "bg-primaria"}`} />
                  <span className="min-w-0 flex-1 truncate text-[13.5px]">{p.rotulo}</span>
                  <span className={p.urgente ? "pilula pilula-urgente" : "pilula"}>{p.nota}</span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="cartao flex min-w-0 flex-col px-5 py-[18px]">
          <h2 className={`text-[17px] ${TITULO}`}>Atalhos</h2>
          <div className="mt-2 flex flex-col">
            {atalhos.map((a) => (
              <Link key={a.href} href={a.href} className="flex min-h-11 items-center gap-3 border-b border-borda py-2 text-[13.5px] text-texto last:border-0 hover:opacity-80">
                <Icone nome={a.icone} tamanho={18} className="shrink-0 text-texto-marca" />
                {a.label}
              </Link>
            ))}
          </div>
        </section>

        <section className="cartao flex min-w-0 flex-col px-5 py-[18px]">
          <h2 className={`text-[17px] ${TITULO}`}>Na casa agora</h2>
          {pessoas.length === 0 ? (
            <p className="mt-3 text-sm text-texto-suave">Ninguém marcado no turno {turno === "noite" ? "da noite" : "do dia"}.</p>
          ) : (
            <div className="mt-4 flex flex-wrap gap-2.5">
              {pessoas.map((p) => (
                <div key={p} className="flex w-12 flex-col items-center gap-1.5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-destaque text-[12.5px] font-bold text-texto-marca-pilula">
                    {p.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="w-full truncate text-center text-xs text-texto-suave">{p}</span>
                </div>
              ))}
            </div>
          )}
          {pode("colaboradores") && (
            <div className="mt-auto flex justify-end pt-4">
              <Link href="/colaboradores/semana" className="text-[13px] font-bold text-texto-marca hover:underline">Escala</Link>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
