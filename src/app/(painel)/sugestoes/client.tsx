"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BotaoAcao } from "@/components/enviar";
import { avisar, perguntar } from "@/components/dialogo";
import { Icone } from "@/components/icone";
import { responderSugestao } from "./actions";

export type Sugestao = {
  id: number;
  nome: string;
  pedido: string;
  contexto: string | null;
  tela: string | null;
  status: "pendente" | "feito" | "descartado";
  resposta: string | null;
  criado_em: string;
  respondido_em: string | null;
};

type Aba = "pendente" | "feito" | "descartado";
const ABAS: { k: Aba; rotulo: string }[] = [
  { k: "pendente", rotulo: "Para fazer" },
  { k: "feito", rotulo: "Feitas" },
  { k: "descartado", rotulo: "Descartadas" },
];

const quando = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export function SugestoesClient({ lista }: { lista: Sugestao[] }) {
  const router = useRouter();
  const [aba, setAba] = useState<Aba>("pendente");
  const conta = (k: Aba) => lista.filter((s) => s.status === k).length;
  const visiveis = lista.filter((s) => s.status === aba);
  if (aba === "pendente") visiveis.sort((a, b) => a.criado_em.localeCompare(b.criado_em));

  async function responder(s: Sugestao, status: Sugestao["status"]) {
    let resposta: string | null = s.resposta;
    if (status === "descartado") {
      const r = await perguntar(`Descartar a sugestão de ${s.nome.split(" ")[0]}? Quer anotar o motivo? (opcional)`, "", { okTexto: "Descartar" });
      if (r === null) return;
      resposta = r;
    }
    const r = await responderSugestao(s.id, status, resposta);
    if (!r.ok) {
      await avisar(r.erro);
      return;
    }
    router.refresh();
  }

  return (
    <div className="pagina">
      <h1 className="titulo-pagina">Sugestões do sistema</h1>
      <p className="mt-1 max-w-2xl text-sm text-texto-suave">
        Ideias que a equipe mandou pelo Ajudante quando quis fazer algo que o sistema ainda não tem.
      </p>

      <div className="mt-6 flex flex-wrap gap-2" role="tablist" aria-label="Situação">
        {ABAS.map(({ k, rotulo }) => {
          const ativo = aba === k;
          const n = conta(k);
          return (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={ativo}
              onClick={() => setAba(k)}
              className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold ${ativo ? "bg-texto text-fundo" : "btn-secundario"}`}
            >
              {rotulo}
              <span className={`rounded-full px-2 text-xs ${ativo ? "bg-primaria text-marca-sobre-primaria" : k === "pendente" && n ? "pilula-urgente-solido" : "pilula-neutra"}`}>{n}</span>
            </button>
          );
        })}
      </div>

      <div className="cartao mt-4 divide-y divide-borda">
        {visiveis.length === 0 ? (
          <p className="p-6 text-sm text-texto-suave">
            {aba === "pendente"
              ? "Nenhuma sugestão esperando. Quando alguém pedir ao Ajudante algo que o sistema não faz, ele oferece mandar a ideia pra cá."
              : "Nada por aqui ainda."}
          </p>
        ) : (
          visiveis.map((s) => (
            <div key={s.id} className="flex flex-wrap items-start gap-4 p-5">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-texto">{s.pedido}</p>
                {s.contexto && <p className="mt-1 text-sm text-texto-suave">{s.contexto}</p>}
                <p className="mt-2 text-xs text-texto-fraco">
                  {s.nome} · {quando(s.criado_em)}
                  {s.tela ? ` · tela ${s.tela}` : ""}
                </p>
                {s.resposta && <p className="mt-2 text-sm text-texto-suave"><Icone nome="conversa" tamanho={13} className="mr-1 inline" />{s.resposta}</p>}
              </div>
              <div className="flex shrink-0 gap-2">
                {s.status === "pendente" ? (
                  <>
                    <BotaoAcao aoClicar={() => responder(s, "feito")} className="btn-principal px-4">Feito</BotaoAcao>
                    <BotaoAcao aoClicar={() => responder(s, "descartado")} className="btn-secundario px-4">Descartar</BotaoAcao>
                  </>
                ) : (
                  <BotaoAcao aoClicar={() => responder(s, "pendente")} className="btn-secundario px-4">Voltar para fazer</BotaoAcao>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
