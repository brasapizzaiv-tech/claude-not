"use client";

import { useState } from "react";
import { BotaoAcao, Enviar } from "@/components/enviar";
import { confirmar } from "@/components/dialogo";
import { apagarAtestado, lancarPremioTrimestre, salvarAtestado } from "./actions";

const CAMPO = "min-h-10 rounded-controle border border-borda-forte bg-transparent px-2 text-sm";
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function LancarTrimestre({ trimestre }: { trimestre: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <BotaoAcao
        aoClicar={async () => {
          if (!(await confirmar("Lançar o prêmio deste trimestre no acerto desta semana?", { detalhe: "Entra como extra de cada pessoa no Semana e 10%. Quem já recebeu não recebe de novo.", okTexto: "Lançar" }))) return;
          const r = await lancarPremioTrimestre(trimestre);
          setMsg(r.ok ? (r.n ? `${r.n} pessoa(s), ${brl(r.total)}, no acerto da semana de ${r.segunda.slice(8, 10)}/${r.segunda.slice(5, 7)}.` : "Ninguém a receber (ou já foi lançado).") : r.erro);
        }}
        className="min-h-10 rounded-controle bg-emerald-600 px-4 text-sm font-semibold text-white"
      >
        Lançar no acerto da semana
      </BotaoAcao>
      {msg && <span className="text-sm text-texto-suave">{msg}</span>}
    </div>
  );
}

export function NovoAtestado({ pessoas, hoje }: { pessoas: { id: string; nome: string }[]; hoje: string }) {
  const [erro, setErro] = useState<string | null>(null);
  return (
    <form
      action={async (fd) => { setErro(null); const r = await salvarAtestado(fd); if (!r.ok) setErro(r.erro); }}
      className="flex flex-wrap items-end gap-2 text-sm"
    >
      <label className="flex flex-col text-xs text-texto-fraco">Pessoa
        <select name="colaborador_id" required className={CAMPO} defaultValue="">
          <option value="" disabled>escolher</option>
          {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
      </label>
      <label className="flex flex-col text-xs text-texto-fraco">De<input type="date" name="inicio" required defaultValue={hoje} className={CAMPO} /></label>
      <label className="flex flex-col text-xs text-texto-fraco">Até<input type="date" name="fim" defaultValue={hoje} className={CAMPO} /></label>
      <label className="flex flex-col text-xs text-texto-fraco">Motivo (opcional)<input name="motivo" maxLength={200} className={`${CAMPO} w-40`} /></label>
      <Enviar className="min-h-10 rounded-controle bg-texto px-3 font-semibold text-fundo">Registrar</Enviar>
      {erro && <p className="w-full text-sm text-red-600">{erro}</p>}
    </form>
  );
}

export function ApagarAtestado({ id }: { id: string }) {
  return (
    <BotaoAcao
      aoClicar={async () => { if (await confirmar("Apagar este atestado?", { perigo: true, okTexto: "Apagar" })) await apagarAtestado(id); }}
      className="text-xs text-red-600"
    >
      apagar
    </BotaoAcao>
  );
}
