"use client";

import { Icone } from "@/components/icone";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dataBR } from "@/lib/format";
import { marcarChegou, atribuirMesa } from "../actions";

export type ResMobile = {
  id: string;
  nome: string;
  telefone: string | null;
  turno: string;
  pessoas: number;
  adultos: number | null;
  criancas: number | null;
  mesa: string | null;
  ocasiao: string | null;
  observacao: string | null;
  status: string;
  chegou_em: string | null;
};

type Resultado = { ok: boolean; mensagem?: string };
export type AcoesRecepcao = {
  marcarChegou: (id: string, chegou: boolean) => Promise<Resultado>;
  atribuirMesa: (id: string, mesa: string) => Promise<Resultado>;
};

const diaSemana = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long" });

function addDias(iso: string, n: number) {
  return new Date(new Date(iso + "T12:00:00").getTime() + n * 864e5).toISOString().slice(0, 10);
}

// Tela da recepção. No painel usa as ações do painel (login); no app da equipe
// (/eu/{token}/reservas) recebe as ações do app, que conferem código + PIN.
export function ReservasHoje({
  dia,
  hoje,
  reservas,
  base = "/reservas/hoje",
  acoes = { marcarChegou, atribuirMesa },
}: {
  dia: string;
  hoje: string;
  reservas: ResMobile[];
  base?: string;
  acoes?: AcoesRecepcao;
}) {
  const router = useRouter();
  const [proc, start] = useTransition();
  const [soFaltam, setSoFaltam] = useState(false);
  const [editMesa, setEditMesa] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const totalPessoas = reservas.reduce((s, r) => s + (r.pessoas || 0), 0);
  const chegaram = reservas.filter((r) => r.chegou_em).length;

  const lista = useMemo(() => {
    const l = soFaltam ? reservas.filter((r) => !r.chegou_em) : reservas;
    // Não chegaram primeiro; depois os que já chegaram.
    return [...l].sort((a, b) => Number(!!a.chegou_em) - Number(!!b.chegou_em) || a.turno.localeCompare(b.turno));
  }, [reservas, soFaltam]);

  const irDia = (d: string) => router.push(`${base}?dia=${d}`);
  const acao = (fn: () => Promise<Resultado>) => start(async () => {
    setErro(null);
    try {
      const r = await fn();
      if (!r.ok) setErro(r.mensagem ?? "Não deu certo. Confira a internet e tente de novo.");
    } catch {
      setErro("Não deu certo. Confira a internet e tente de novo.");
    }
    router.refresh();
  });

  return (
    <div className="pagina max-w-xl pb-16">
      {/* Cabeçalho fixo */}
      <div className="sticky top-0 z-10 -mx-3 border-b border-borda bg-painel-fundo/95 px-3 py-3 backdrop-blur">
        <h1 className="text-center text-lg font-bold text-texto">Reservas</h1>
        <div className="mt-2 flex items-center justify-between">
          <button onClick={() => irDia(addDias(dia, -1))} className="flex min-h-11 min-w-11 items-center justify-center rounded-controle border border-borda-forte px-3"><Icone nome="voltar" tamanho={16} titulo="Dia anterior" /></button>
          <div className="text-center">
            <div className="text-sm font-semibold capitalize text-texto">{diaSemana(dia)}</div>
            <div className="text-xs text-texto-suave">{dataBR(dia)}{dia === hoje ? " · hoje" : ""}</div>
          </div>
          <button onClick={() => irDia(addDias(dia, 1))} className="flex min-h-11 min-w-11 items-center justify-center rounded-controle border border-borda-forte px-3"><Icone nome="seguir" tamanho={16} titulo="Próximo dia" /></button>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-controle bg-superficie-suave py-1.5"><div className="font-numero text-lg font-bold text-texto">{reservas.length}</div><div className="text-mini text-texto-fraco">reservas</div></div>
          <div className="rounded-controle bg-superficie-suave py-1.5"><div className="font-numero text-lg font-bold text-texto">{totalPessoas}</div><div className="text-mini text-texto-fraco">pessoas</div></div>
          <div className="rounded-controle bg-ok-fundo py-1.5"><div className="font-numero text-lg font-bold text-ok-texto">{chegaram}</div><div className="text-mini text-ok-texto">chegaram</div></div>
        </div>
        <label className="mt-2 flex min-h-11 items-center justify-center gap-2 text-sm text-texto-suave">
          <input type="checkbox" checked={soFaltam} onChange={(e) => setSoFaltam(e.target.checked)} />
          Mostrar só quem ainda não chegou
        </label>
        {erro && <p role="alert" className="mt-1 text-center text-sm font-semibold text-urgente-texto">{erro}</p>}
      </div>

      {/* Lista */}
      <div className="mt-3 space-y-2">
        {lista.length === 0 && (
          <div className="rounded-cartao bg-painel-cartao p-8 text-center text-sm text-texto-fraco">Nenhuma reserva neste dia.</div>
        )}
        {lista.map((r) => {
          return (
            <div
              key={r.id}
              className={`rounded-cartao border p-3 ${
                r.chegou_em ? "border-ok-texto/40 bg-ok-fundo" : "border-borda bg-painel-cartao"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-base font-bold text-texto">
                    {r.ocasiao && r.ocasiao !== "Só uma reserva" && <Icone nome="bolo" tamanho={13} className="mr-1 text-texto-marca" />}{r.nome}
                  </div>
                  <div className="text-xs text-texto-suave">
                    {r.pessoas} {r.pessoas === 1 ? "pessoa" : "pessoas"}
                    {r.criancas ? ` (${r.adultos ?? r.pessoas} ad. + ${r.criancas} cri.)` : ""} · {r.turno}
                  </div>
                  {r.observacao && <div className="mt-0.5 flex items-start gap-1.5 text-xs text-aviso-texto"><Icone nome="editar" tamanho={12} className="mt-0.5" /> {r.observacao}</div>}
                </div>
                <div className="shrink-0 text-right">
                  {r.chegou_em ? (
                    <span className="pilula pilula-ok">✓ chegou</span>
                  ) : (
                    <span className="pilula pilula-aviso">aguardando</span>
                  )}
                </div>
              </div>

              {/* Mesa */}
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-texto-fraco">Mesa:</span>
                {editMesa === r.id ? (
                  <input
                    autoFocus
                    inputMode="numeric"
                    aria-label={`Mesa de ${r.nome}`}
                    defaultValue={r.mesa ?? ""}
                    onBlur={(e) => { setEditMesa(null); if ((e.target.value || "") !== (r.mesa ?? "")) acao(() => acoes.atribuirMesa(r.id, e.target.value)); }}
                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                    placeholder="ex.: 12"
                    className="campo w-24"
                  />
                ) : (
                  <button onClick={() => setEditMesa(r.id)} className="min-h-11 rounded-controle border border-borda-forte px-3 text-sm font-medium text-texto-suave">
                    {r.mesa ? `Mesa ${r.mesa}` : "definir"}
                  </button>
                )}
              </div>

              {/* Ação: só marcar que chegou */}
              <button
                onClick={() => acao(() => acoes.marcarChegou(r.id, !r.chegou_em))}
                disabled={proc}
                className={`mt-2 w-full rounded-controle py-3 text-base font-bold disabled:opacity-60 ${
                  r.chegou_em ? "border border-borda-forte text-texto-suave" : "btn-principal"
                }`}
              >
                {r.chegou_em ? "Desmarcar chegada" : "✓ Chegou"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
