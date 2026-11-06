"use client";

// Três cupons da mesma pessoa no caixa: junta tudo numa comanda só e escolhe como
// cobrar o buffet. Quem conta o que vale cada opção é o servidor.
import { useState } from "react";
import { BotaoAcao } from "@/components/enviar";
import { avisar } from "@/components/dialogo";
import { Icone } from "@/components/icone";
import type { ModoJuntar } from "@/lib/juntar-comandas";
import { juntarComandasCaixa, previaJuntarComandas } from "../actions";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const kg = (n: number) => `${n.toFixed(3).replace(".", ",")} kg`;

type Previa = Extract<Awaited<ReturnType<typeof previaJuntarComandas>>, { ok: true }>;

export function JuntarComandas({ ids, aoJuntar }: { ids: string[]; aoJuntar: (id: string, numero: number, valor: number) => void }) {
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [escolha, setEscolha] = useState<string>("livre");

  const fechar = () => setPrevia(null);
  const principal = previa?.comandas[0];
  const outras = previa?.comandas.slice(1) ?? [];

  async function abrir() {
    const r = await previaJuntarComandas(ids);
    if (!r.ok) { void avisar(r.mensagem); return; }
    setEscolha(r.livreHoje > 0 ? "livre" : r.somar ? "somar" : r.comandas[0].id);
    setPrevia(r);
  }

  async function juntar() {
    const modo: ModoJuntar = escolha === "livre" || escolha === "somar" ? { tipo: escolha } : { tipo: "manter", id: escolha };
    const r = await juntarComandasCaixa(ids, modo);
    if (!r.ok) { void avisar(r.mensagem); return; }
    setPrevia(null);
    aoJuntar(r.id, r.numero, r.valor);
  }

  const opcao = (valor: string, titulo: string, detalhe: string) => (
    <label key={valor} className={`flex min-h-11 cursor-pointer items-start gap-2.5 rounded-controle border-2 px-3 py-2 text-sm ${escolha === valor ? "border-primaria bg-destaque text-texto" : "border-borda-forte text-texto-suave"}`}>
      <input type="radio" name="modo-juntar" checked={escolha === valor} onChange={() => setEscolha(valor)} className="mt-0.5 h-5 w-5 shrink-0" />
      <span className="min-w-0">
        <span className="block font-semibold">{titulo}</span>
        <span className="block text-xs text-texto-suave">{detalhe}</span>
      </span>
    </label>
  );

  return (
    <>
      <BotaoAcao aoClicar={abrir} className="btn-secundario !min-h-11 text-sm">
        <span className="inline-flex items-center gap-1.5"><Icone nome="dividir" tamanho={15} /> Juntar em uma só</span>
      </BotaoAcao>

      {previa && principal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Juntar comandas">
          <div className="cartao my-6 w-full max-w-md p-5">
            <div className="mb-1 flex items-start justify-between gap-3">
              <h2 className="font-numero text-xl font-bold tracking-apertada text-texto">Juntar na comanda #{principal.numero}</h2>
              <button type="button" onClick={fechar} aria-label="Fechar" className="flex h-11 w-11 shrink-0 items-center justify-center text-texto-fraco"><Icone nome="fechar" tamanho={18} /></button>
            </div>
            <p className="mb-3 text-sm text-texto-suave">
              {outras.map((c) => `#${c.numero}`).join(", ")} {outras.length > 1 ? "somem" : "some"} e os itens vão para a #{principal.numero}. Como cobrar o buffet? (valores sem os 10%)
            </p>
            <div className="space-y-2">
              {previa.livreHoje > 0 && opcao("livre", `Buffet livre · ${brl(previa.livreHoje)}`, "Cobra um buffet livre só, o de hoje.")}
              {previa.somar && opcao("somar", `Somar os pesos · ${brl(previa.somar.valor)}`, `${kg(previa.somar.peso)} no total, com o teto do livre. Use se foram pratos diferentes.`)}
              {previa.comandas.map((c) =>
                opcao(c.id, `Valor da #${c.numero} · ${brl(c.valor)}`, c.livre ? "Buffet livre dessa comanda." : c.peso > 0 ? `Só o peso dela, ${kg(c.peso)}. Use se foi o mesmo prato pesado de novo.` : "Sem buffet nessa comanda."),
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={fechar} className="btn-secundario text-sm">Cancelar</button>
              <BotaoAcao aoClicar={juntar} className="btn-principal text-sm">Juntar na #{principal.numero}</BotaoAcao>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
