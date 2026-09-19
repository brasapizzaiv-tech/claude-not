import type { ConfigHorarios } from "@/lib/delivery-horarios";
import { Icone } from "@/components/icone";

// Seção "Horários e agendamento" do formulário de config do delivery
// (campos simples; quem lê é salvarConfigDelivery).
const DIAS = [["1", "Seg"], ["2", "Ter"], ["3", "Qua"], ["4", "Qui"], ["5", "Sex"], ["6", "Sáb"], ["0", "Dom"]] as const;
const inp = "mt-1 w-full rounded-controle border border-borda-forte bg-transparent px-3 py-2 text-sm ";

export function HorariosConfig({ cfg }: { cfg: ConfigHorarios }) {
  const turnos = [
    cfg.turnos.find((t) => t.id === "almoco") ?? { id: "almoco", nome: "Almoço", dias: [] as number[], agendaAbre: "08:30", livreAbre: "11:15", livreFecha: "13:20" },
    cfg.turnos.find((t) => t.id === "noite") ?? { id: "noite", nome: "Noite", dias: [] as number[], agendaAbre: "15:00", livreAbre: "18:30", livreFecha: "22:00" },
  ];
  return (
    <div className="rounded-cartao border border-borda p-4">
      <h2 className="flex items-center gap-1.5 font-bold"><Icone nome="relogio" tamanho={16} /> Horários e agendamento</h2>
      <p className="mb-3 text-xs text-texto-suave">
        Pedidos <b>pra agora</b> só dentro da janela “livre”. O <b>agendamento</b> abre mais cedo: o cliente escolhe um horário exato dentro da janela livre do mesmo dia.
      </p>
      <div className="space-y-3">
        {turnos.map((t) => (
          <div key={t.id} className="rounded-cartao bg-superficie-suave p-3">
            <div className="mb-2 flex flex-wrap items-center gap-3">
              <span className="font-semibold">{t.nome}</span>
              <div className="flex flex-wrap gap-2 text-xs">
                {DIAS.map(([v, l]) => (
                  <label key={v} className="flex items-center gap-1">
                    <input type="checkbox" name={`t_${t.id}_dias`} value={v} defaultChecked={t.dias.includes(Number(v))} /> {l}
                  </label>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-texto-suave">Agendamento abre</label>
                <input type="time" name={`t_${t.id}_agenda`} defaultValue={t.agendaAbre} className={inp} />
              </div>
              <div>
                <label className="text-xs text-texto-suave">Pedidos livres de</label>
                <input type="time" name={`t_${t.id}_livre_abre`} defaultValue={t.livreAbre} className={inp} />
              </div>
              <div>
                <label className="text-xs text-texto-suave">até</label>
                <input type="time" name={`t_${t.id}_livre_fecha`} defaultValue={t.livreFecha} className={inp} />
              </div>
            </div>
            <p className="mt-1 text-mini text-texto-fraco">Sem nenhum dia marcado, o turno fica desligado.</p>
          </div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div>
          <label className="text-xs text-texto-suave">Intervalo dos horários (min)</label>
          <input name="intervalo_min" defaultValue={cfg.intervaloMin} inputMode="numeric" className={inp} />
        </div>
        <div>
          <label className="text-xs text-texto-suave">Pedidos por horário</label>
          <input name="max_por_horario" defaultValue={cfg.maxPorHorario} inputMode="numeric" className={inp} />
          <p className="mt-1 text-mini text-texto-fraco">0 = sem limite</p>
        </div>
        <div>
          <label className="text-xs text-texto-suave">Antecedência mínima (min)</label>
          <input name="antecedencia_min" defaultValue={cfg.antecedenciaMin} inputMode="numeric" className={inp} />
        </div>
        <div>
          <label className="text-xs text-texto-suave">Pedido mínimo (R$)</label>
          <input name="pedido_minimo" defaultValue={cfg.pedidoMinimo} inputMode="decimal" className={inp} />
          <p className="mt-1 text-mini text-texto-fraco">Sem a taxa. Vale na retirada.</p>
        </div>
      </div>
    </div>
  );
}
