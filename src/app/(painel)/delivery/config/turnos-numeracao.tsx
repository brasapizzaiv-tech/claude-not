"use client";

// Turnos do delivery (migration 0237): a numeração dos pedidos recomeça em 1
// a cada turno. Turno que passa da meia-noite (ex.: noite 16:00 → 06:00)
// conta como o dia em que começou. Horário fora de todos os turnos vira
// "Extra" — por isso o aviso quando sobra buraco.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { BotaoAcao } from "@/components/enviar";
import { Icone } from "@/components/icone";
import { salvarTurnosDelivery } from "./turnos-actions";

export type TurnoLinha = { nome: string; inicio: string; fim: string };

const min = (h: string) => { const [a, b] = h.split(":").map(Number); return a * 60 + (b || 0); };

/** Minutos do dia cobertos por cada turno (pra achar sobreposição e buraco). */
function cobertura(lista: TurnoLinha[]) {
  const dono = new Array<number>(1440).fill(0);
  for (const t of lista) {
    if (!/^\d{2}:\d{2}$/.test(t.inicio) || !/^\d{2}:\d{2}$/.test(t.fim)) continue;
    const i = min(t.inicio), f = min(t.fim);
    const total = i === f ? 1440 : (f - i + 1440) % 1440;
    for (let k = 0; k < total; k++) dono[(i + k) % 1440]++;
  }
  return { sobra: dono.some((n) => n === 0), sobrepoe: dono.some((n) => n > 1) };
}

export function TurnosNumeracao({ inicial, agora }: { inicial: TurnoLinha[]; agora: string | null }) {
  const router = useRouter();
  const [lista, setLista] = useState<TurnoLinha[]>(inicial.length ? inicial : [{ nome: "Almoço", inicio: "06:00", fim: "16:00" }]);
  const [msg, setMsg] = useState<string | null>(null);
  const mudou = JSON.stringify(lista) !== JSON.stringify(inicial);
  const { sobra, sobrepoe } = cobertura(lista);
  const set = (i: number, k: keyof TurnoLinha, v: string) => setLista((l) => l.map((t, j) => (j === i ? { ...t, [k]: v } : t)));
  const campo = "min-h-11 rounded-controle border border-borda-forte bg-painel-cartao px-3 text-sm text-texto";

  async function salvar() {
    setMsg(null);
    const r = await salvarTurnosDelivery(lista);
    if (!r.ok) { setMsg(r.mensagem); return; }
    setMsg("Turnos salvos. Os próximos pedidos já seguem esses horários.");
    router.refresh();
  }

  return (
    <section className="cartao mt-6 p-5">
      <h2 className="font-numero text-lg font-bold text-texto">Turnos e numeração</h2>
      <p className="mt-1 text-sm text-texto-suave">
        O número dos pedidos do delivery recomeça em 1 a cada turno. Turno que passa da meia-noite conta como o dia em que começou.
        {agora ? <> Agora é <b className="text-texto">{agora}</b>.</> : null}
      </p>
      <div className="mt-4 flex flex-col gap-2">
        <div className="rotulo grid grid-cols-[minmax(0,1fr)_110px_110px_44px] gap-2"><span>Nome</span><span>Começa</span><span>Acaba</span><span /></div>
        {lista.map((t, i) => (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_110px_110px_44px] items-center gap-2">
            <input value={t.nome} onChange={(e) => set(i, "nome", e.target.value.slice(0, 30))} aria-label="Nome do turno" className={campo} />
            <input type="time" value={t.inicio} onChange={(e) => set(i, "inicio", e.target.value)} aria-label="Começa" className={campo} />
            <input type="time" value={t.fim} onChange={(e) => set(i, "fim", e.target.value)} aria-label="Acaba" className={campo} />
            <button type="button" onClick={() => setLista((l) => l.filter((_, j) => j !== i))} disabled={lista.length === 1} aria-label={`Tirar ${t.nome}`} className="flex h-11 w-11 items-center justify-center rounded-controle text-texto-fraco hover:bg-urgente-fundo hover:text-urgente-texto disabled:opacity-30">
              <Icone nome="lixeira" tamanho={16} />
            </button>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => setLista((l) => [...l, { nome: "", inicio: "", fim: "" }])} className="mt-2 text-sm font-semibold text-texto-marca hover:underline">+ turno</button>

      {sobrepoe && <p className="mt-3 rounded-controle bg-urgente-fundo px-3 py-2 text-sm text-urgente-texto">Tem horário em dois turnos ao mesmo tempo. Ajuste pra um acabar onde o outro começa.</p>}
      {!sobrepoe && sobra && <p className="mt-3 rounded-controle bg-destaque px-3 py-2 text-sm text-texto-marca-pilula">Tem horário fora de todos os turnos: pedido nesse horário entra num turno &quot;Extra&quot;.</p>}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <BotaoAcao aoClicar={salvar} disabled={!mudou || sobrepoe} className="btn-principal text-sm">Salvar turnos</BotaoAcao>
        {msg && <span className="text-sm text-texto-suave">{msg}</span>}
      </div>
      <p className="mt-2 text-xs text-texto-fraco">Mudar os horários vale pros pedidos novos. Pedido que já entrou fica com o número que recebeu.</p>
    </section>
  );
}
