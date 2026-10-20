"use client";

// Prazo pra responder a cotação (migration 0247): mostra até quando, quanto
// falta e muda com um toque (+2 h, +1 dia…, ou dia/hora). Com a cotação
// fechada vira "Reabrir por mais tempo". `comPadrao` mostra também o prazo
// padrão, que começa a contar no primeiro envio do link.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { BotaoAcao } from "@/components/enviar";
import { avisar } from "@/components/dialogo";
import { deInput, paraInput, textoFalta, textoPrazo, venceu } from "@/lib/cotacao-prazo";
import { definirPrazoCotacao, salvarPrazoPadraoCotacao } from "./actions";

const PADROES = [
  { h: 0, t: "Sem prazo" },
  { h: 4, t: "4 horas" },
  { h: 12, t: "12 horas" },
  { h: 24, t: "1 dia" },
  { h: 48, t: "2 dias" },
  { h: 72, t: "3 dias" },
];

// Amanhã ao meio-dia (horário de Brasília).
function amanhaMeioDia() {
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return new Date(new Date(`${hoje}T12:00:00-03:00`).getTime() + 86400000).toISOString();
}

export function PrazoCotacao({
  cotacaoId, respostasAte, fechada, padraoHoras, comPadrao = false,
}: {
  cotacaoId: string;
  respostasAte: string | null;
  fechada: boolean;
  padraoHoras?: number | null;
  comPadrao?: boolean;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [quando, setQuando] = useState(paraInput(respostasAte));
  const [padrao, setPadrao] = useState(String(padraoHoras ?? 0));
  const vencido = venceu(respostasAte);
  const falta = respostasAte ? textoFalta(respostasAte) : null;

  async function aplicar(iso: string | null) {
    const r = await definirPrazoCotacao(cotacaoId, iso);
    if (!r.ok) { void avisar(r.mensagem ?? "Não deu certo."); return; }
    setAberto(false);
    router.refresh();
  }
  const daqui = (h: number) => new Date(Date.now() + h * 3600000).toISOString();

  return (
    <div className="cartao p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="rotulo">Respostas até</span>
        {respostasAte ? (
          <span className="font-numero text-base font-bold text-texto">{textoPrazo(respostasAte)}</span>
        ) : (
          <span className="text-sm text-texto-suave">sem prazo</span>
        )}
        {fechada ? (
          <span className="pilula pilula-neutra">{vencido ? "prazo encerrado · fechada" : "fechada"}</span>
        ) : falta ? (
          <span className="pilula">{falta}</span>
        ) : null}
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          className={`ml-auto ${fechada ? "btn-principal" : "btn-secundario"} !min-h-11 text-sm`}
        >
          {fechada ? "Reabrir por mais tempo" : respostasAte ? "Mudar prazo" : "Pôr prazo"}
        </button>
      </div>

      {aberto && (
        <div className="mt-3 flex flex-col gap-3 border-t border-borda pt-3">
          <p className="text-xs text-texto-suave">
            {fechada
              ? "Escolha até quando os fornecedores podem responder de novo. O mesmo link volta a funcionar."
              : "Quando chegar a hora, o link dos fornecedores trava e a cotação fecha sozinha."}
          </p>
          <div className="flex flex-wrap gap-2">
            <BotaoAcao aoClicar={() => aplicar(daqui(2))} className="btn-secundario !min-h-11 text-sm">+2 horas</BotaoAcao>
            <BotaoAcao aoClicar={() => aplicar(amanhaMeioDia())} className="btn-secundario !min-h-11 text-sm">Amanhã 12h</BotaoAcao>
            <BotaoAcao aoClicar={() => aplicar(daqui(24))} className="btn-secundario !min-h-11 text-sm">+1 dia</BotaoAcao>
            <BotaoAcao aoClicar={() => aplicar(daqui(48))} className="btn-secundario !min-h-11 text-sm">+2 dias</BotaoAcao>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-texto-suave">
              Ou dia e hora
              <input
                type="datetime-local"
                value={quando}
                onChange={(e) => setQuando(e.target.value)}
                className="mt-1 block min-h-11 rounded-controle border border-borda-forte bg-painel-cartao px-3 text-sm text-texto"
              />
            </label>
            <BotaoAcao
              aoClicar={() => (deInput(quando) ? aplicar(deInput(quando)) : avisar("Escolha o dia e a hora."))}
              className="btn-principal !min-h-11 text-sm"
            >
              {fechada ? "Reabrir até aí" : "Usar esse"}
            </BotaoAcao>
            {(respostasAte || fechada) && (
              <BotaoAcao aoClicar={() => aplicar(null)} className="btn-secundario !min-h-11 text-sm">
                {fechada ? "Reabrir sem prazo" : "Tirar o prazo"}
              </BotaoAcao>
            )}
          </div>
        </div>
      )}

      {comPadrao && (
        <label className="mt-3 flex flex-wrap items-center gap-2 border-t border-borda pt-3 text-sm text-texto-suave">
          Prazo padrão das próximas cotações (conta do primeiro envio do link):
          <select
            value={padrao}
            onChange={async (e) => {
              setPadrao(e.target.value);
              const r = await salvarPrazoPadraoCotacao(Number(e.target.value) || null);
              if (!r.ok) void avisar("Não consegui salvar o prazo padrão.");
              else router.refresh();
            }}
            className="min-h-11 rounded-controle border border-borda-forte bg-painel-cartao px-3 text-sm text-texto"
          >
            {PADROES.map((p) => <option key={p.h} value={p.h}>{p.t}</option>)}
            {!PADROES.some((p) => String(p.h) === padrao) && <option value={padrao}>{padrao} horas</option>}
          </select>
        </label>
      )}
    </div>
  );
}
