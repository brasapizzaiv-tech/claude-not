"use client";

// Batidas do relógio com CPF que não está em nenhum cadastro. Sem esse vínculo
// a batida não vira presença (e a pessoa não aparece "na casa"). O CPF fica
// escondido: o nome que está no relógio e os horários ajudam a reconhecer quem
// é, e quando o nome bate com um cadastro sem CPF ele já vem escolhido.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { BotaoAcao } from "@/components/enviar";
import { vincularCpfPonto } from "./actions";

export type CpfSemDono = { cpf: string; nome: string | null; sugestao: string | null; batidas: number; ultimas: string[] };

const esconder = (cpf: string) => `•••.•••.${cpf.slice(6, 9)}-${cpf.slice(9, 11)}`;

export function BatidasSemColaborador({ lista, colaboradores }: { lista: CpfSemDono[]; colaboradores: { id: string; nome: string; temCpf: boolean }[] }) {
  const router = useRouter();
  const [escolha, setEscolha] = useState<Record<string, string>>(() =>
    Object.fromEntries(lista.filter((x) => x.sugestao).map((x) => [x.cpf, x.sugestao as string])),
  );
  const [msg, setMsg] = useState<string | null>(null);
  if (lista.length === 0) return null;
  const semCpf = colaboradores.filter((c) => !c.temCpf);
  const comCpf = colaboradores.filter((c) => c.temCpf);
  return (
    <section className="cartao mb-4 p-5">
      <h2 className="font-numero text-lg font-bold text-texto">Batidas sem colaborador <span className="pilula pilula-urgente ml-1 align-middle">{lista.length}</span></h2>
      <p className="mt-1 text-sm text-texto-suave">
        O relógio mandou batidas de CPFs (ou PIS, pra quem foi cadastrado no relógio pelo PIS) que não estão no cadastro. Sem isso a batida não vira presença. Diga de quem é cada um (uma vez só): o CPF vai pro cadastro e as batidas antigas e as próximas já ficam ligadas.
      </p>
      <ul className="mt-3 flex flex-col gap-2">
        {lista.map((x) => (
          <li key={x.cpf} className="flex flex-wrap items-center gap-3 rounded-controle bg-painel-fundo px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="font-numero text-sm font-bold text-texto">{x.nome ? <>{x.nome} <span className="font-sans text-xs font-normal text-texto-suave">(no relógio) · CPF {esconder(x.cpf)}</span></> : <>CPF {esconder(x.cpf)}</>} <span className="font-sans text-xs font-normal text-texto-suave">· {x.batidas} batida{x.batidas === 1 ? "" : "s"}</span></p>
              <p className="text-xs text-texto-suave">Últimas: {x.ultimas.join(" · ")}</p>
            </div>
            <select
              value={escolha[x.cpf] ?? ""}
              onChange={(e) => setEscolha((s) => ({ ...s, [x.cpf]: e.target.value }))}
              aria-label="De quem é esse CPF"
              className="min-h-11 rounded-controle border border-borda-forte bg-painel-cartao px-2 text-sm text-texto"
            >
              <option value="">— de quem é? —</option>
              <optgroup label="Sem CPF no cadastro">
                {semCpf.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </optgroup>
              {comCpf.length > 0 && (
                <optgroup label="Já têm CPF">
                  {comCpf.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </optgroup>
              )}
            </select>
            <BotaoAcao
              aoClicar={async () => {
                setMsg(null);
                const r = await vincularCpfPonto(x.cpf, escolha[x.cpf] ?? "");
                if (!r.ok) { setMsg(r.erro); return; }
                setMsg(`Ligado: ${r.batidas} batida(s) e ${r.presencas} presença(s) marcadas.`);
                router.refresh();
              }}
              disabled={!escolha[x.cpf]}
              className="btn-principal !min-h-11 text-sm"
            >
              Ligar
            </BotaoAcao>
          </li>
        ))}
      </ul>
      {msg && <p className="mt-2 text-sm text-texto-suave">{msg}</p>}
    </section>
  );
}
