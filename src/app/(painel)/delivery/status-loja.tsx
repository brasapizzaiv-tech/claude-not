"use client";

// Selo "a loja está aberta?" no topo do delivery (pedido do Rafael, 27/11/2026):
// mostra o que o cliente está vendo no app AGORA — aberto pra pedir na hora,
// só agendamento, ou fechado (e quando abre) — e um botão pra fechar/abrir na
// hora (o mesmo "Delivery ligado" da Config). Recalcula a cada 30 s.
// Tempos de Retirada e Entrega ao lado (como o "Buscar/Entregar" do sistema
// antigo): mudam na hora o que o app mostra e a previsão dos pedidos novos.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { estadoDelivery, type ConfigHorarios } from "@/lib/delivery-horarios";
import { BotaoAcao } from "@/components/enviar";
import { confirmar, avisar } from "@/components/dialogo";
import { definirDeliveryAberto, definirTemposDelivery } from "./actions";
import { opcoesCom, type TemposDelivery } from "@/lib/delivery-tempos";

export function StatusLoja({ horarios, aberto, tempos }: { horarios: ConfigHorarios; aberto: boolean; tempos: TemposDelivery }) {
  const router = useRouter();
  const [t, setT] = useState(tempos);
  const [salvando, setSalvando] = useState(false);
  async function mudarTempo(novo: TemposDelivery) {
    const antes = t;
    setT(novo);
    setSalvando(true);
    const r = await definirTemposDelivery(novo.entrega, novo.retirada);
    setSalvando(false);
    if (!r.ok) { setT(antes); return avisar(r.mensagem ?? "Não consegui salvar. Tente de novo."); }
    router.refresh();
  }
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  const e = estadoDelivery(horarios, agora);

  let pilula = "pilula-neutra";
  let titulo = "FECHADO";
  let detalhe = e.proximaAbertura ? `abre ${e.proximaAbertura.texto}` : "sem horário cadastrado";
  if (!aberto) {
    pilula = "pilula-urgente";
    titulo = "FECHADO NA MÃO";
    detalhe = "o app não aceita pedido nenhum até você abrir";
  } else if (e.livre) {
    pilula = "pilula-ok";
    titulo = "ABERTO";
    detalhe = `pedidos pra agora até ${e.fechaEm ?? "—"}`;
  } else if (e.agendamentoAberto) {
    pilula = "pilula";
    titulo = "SÓ AGENDAMENTO";
    detalhe = e.proximaAbertura ? `pedido pra agora abre ${e.proximaAbertura.texto}` : "só pedidos agendados";
  }

  return (
    <div className="cartao mb-3 flex flex-wrap items-center gap-3 p-3">
      <span className={`${pilula} px-3 py-1 text-sm font-bold`}>{titulo}</span>
      <span className="text-sm text-texto-suave">App de pedidos: {detalhe}</span>
      <div className="ml-auto flex flex-wrap items-center gap-2" aria-busy={salvando}>
        {([["retirada", "Retirada"], ["entrega", "Entrega"]] as const).map(([k, rot]) => (
          <label key={k} className="flex items-center gap-1.5 text-sm text-texto-suave">
            {rot}
            <select
              value={t[k]}
              disabled={salvando}
              onChange={(e) => mudarTempo({ ...t, [k]: Number(e.target.value) })}
              className="campo min-h-11 w-auto py-0 pl-2 pr-7 font-numero font-semibold text-texto"
              title={`Tempo de ${rot.toLowerCase()} que o cliente vê no app`}
            >
              {opcoesCom(t[k]).map((m) => <option key={m} value={m}>{m} min</option>)}
            </select>
          </label>
        ))}
      </div>
      <BotaoAcao
        className={`${aberto ? "btn-secundario" : "btn-principal"} min-h-11 px-4 text-sm`}
        aoClicar={async () => {
          if (aberto && !(await confirmar("Fechar o delivery agora?", { detalhe: "O app para de aceitar pedidos (pra agora e agendados) até você abrir de novo.", okTexto: "Fechar agora", perigo: true }))) return;
          const r = await definirDeliveryAberto(!aberto);
          if (!r.ok) return avisar(r.mensagem ?? "Não consegui mudar. Tente de novo.");
          router.refresh();
        }}
      >
        {aberto ? "Fechar agora" : "Abrir o delivery"}
      </BotaoAcao>
    </div>
  );
}
