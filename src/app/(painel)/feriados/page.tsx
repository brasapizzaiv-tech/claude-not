import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { exigirAcesso } from "@/lib/permissoes-server";
import { somarDias, type Feriado } from "@/lib/feriados";
import type { Evento } from "@/lib/eventos";
import { FeriadosClient } from "./client";
import { EventosClient } from "./eventos-client";

export const metadata = { title: "Feriados e eventos · Brasa" };
export const dynamic = "force-dynamic";

// FERIADOS E EVENTOS
//
// Duas abas porque são duas perguntas diferentes que a casa faz — "no dia 12 a
// gente abre?" e "o que tem marcado pro sábado?" —, mas o mesmo assunto: o que
// já está decidido pra uma data. Nas TVs as duas voltam a ser uma coisa só, em
// ordem de data, porque de longe ninguém quer saber qual tabela guardou o quê.
//
// A aba vem do endereço (?aba=eventos) e não de um botão que guarda estado: o
// link fica compartilhável e a tela não precisa de nada do navegador.
export default async function FeriadosPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string }>;
}) {
  await exigirAcesso("/feriados");
  const { aba = "" } = await searchParams;
  const emEventos = aba === "eventos";
  const supabase = await createClient();
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const desde = somarDias(hoje, -180);

  const [{ data: dFeriados }, { data: dEventos }] = await Promise.all([
    supabase
      .from("feriados")
      .select("id, data, data_fim, nome, situacao, detalhe")
      // Pelo FIM, não pelo começo: férias coletivas que já começaram ainda estão
      // valendo, e sumir da lista no primeiro dia seria o pior momento.
      .or(`data_fim.gte.${desde},and(data_fim.is.null,data.gte.${desde})`)
      .order("data"),
    supabase
      .from("eventos")
      .select("id, data, hora, titulo, pessoas, lugar, contato, telefone, cardapio, observacao, status")
      .gte("data", desde)
      .order("data"),
  ]);

  const feriados: Feriado[] = ((dFeriados as Record<string, unknown>[]) ?? []).map((f) => ({
    id: String(f.id),
    data: String(f.data).slice(0, 10),
    dataFim: (f.data_fim as string | null) ?? null,
    nome: String(f.nome ?? ""),
    situacao: String(f.situacao ?? "indefinido") as Feriado["situacao"],
    detalhe: (f.detalhe as string | null) ?? null,
  }));

  const eventos: Evento[] = ((dEventos as Record<string, unknown>[]) ?? []).map((e) => ({
    id: String(e.id),
    data: String(e.data).slice(0, 10),
    hora: (e.hora as string | null) ?? null,
    titulo: String(e.titulo ?? ""),
    pessoas: Number(e.pessoas ?? 0),
    lugar: (e.lugar as string | null) ?? null,
    contato: (e.contato as string | null) ?? null,
    telefone: (e.telefone as string | null) ?? null,
    cardapio: (e.cardapio as string | null) ?? null,
    observacao: (e.observacao as string | null) ?? null,
    status: String(e.status ?? "marcado") as Evento["status"],
  }));

  const marcados = eventos.filter((e) => e.data >= hoje && e.status !== "cancelado").length;
  const aDefinir = feriados.filter(
    (f) => (f.dataFim && f.dataFim > f.data ? f.dataFim : f.data) >= hoje && f.situacao === "indefinido",
  ).length;

  return (
    <div className="w-full p-5">
      <h1 className="font-numero text-2xl font-semibold tracking-apertada text-texto">
        Feriados e eventos
      </h1>
      <p className="mt-0.5 max-w-[70ch] text-sm text-texto-suave">
        O que já está decidido pra uma data. O que estiver aqui aparece sozinho
        na TV da cozinha e no mural do escritório — a equipe para de perguntar e
        ninguém mais descobre no dia.
      </p>

      {/* ---------- Abas ---------- */}
      <div className="mt-5 mb-5 flex gap-2 border-b border-borda">
        <Aba href="/feriados" ativa={!emEventos} rotulo="Feriados" aviso={aDefinir} />
        <Aba href="/feriados?aba=eventos" ativa={emEventos} rotulo="Eventos marcados" aviso={marcados} />
      </div>

      {emEventos ? (
        <EventosClient eventos={eventos} hoje={hoje} />
      ) : (
        <FeriadosClient feriados={feriados} hoje={hoje} />
      )}
    </div>
  );
}

// O número ao lado do nome tem significado diferente em cada aba, e de
// propósito: nos feriados é o que ESPERA decisão; nos eventos é o que está
// marcado. Nos dois casos é o número que faz alguém querer abrir a aba.
function Aba({ href, ativa, rotulo, aviso }: { href: string; ativa: boolean; rotulo: string; aviso: number }) {
  return (
    <Link
      href={href}
      className={`-mb-px border-b-2 px-3 pb-2 text-sm font-medium transition ${
        ativa ? "border-primaria text-texto" : "border-transparent text-texto-suave hover:text-texto"
      }`}
    >
      {rotulo}
      {aviso > 0 && (
        <span className="ml-2 rounded-controle bg-superficie-suave px-1.5 py-0.5 text-mini font-semibold text-texto-suave">
          {aviso}
        </span>
      )}
    </Link>
  );
}
