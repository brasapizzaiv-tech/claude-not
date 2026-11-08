"use client";
import { Icone } from "@/components/icone";
import { confirmar } from "@/components/dialogo";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BotaoAcao } from "@/components/enviar";
import { baixarFiadoSemCaixa, receberFiado } from "../../actions";

const MOTIVOS_BAIXA = ["Troca de serviço", "Cortesia (família e amigos)", "Outro"];

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (s: string) => Number(String(s).replace(/\./g, "").replace(",", ".")) || 0;

export type ClienteFiado = {
  id: string;
  nome: string;
  telefone: string | null;
  saldo: number;
  lancamentos: { id: string; tipo: "debito" | "pagamento"; valor: number; descricao: string | null; forma: string | null; quando: string }[];
};

export function FiadoClient({ clientes, formas }: { clientes: ClienteFiado[]; formas: string[] }) {
  const router = useRouter();
  const [pend, start] = useTransition();
  const [aberto, setAberto] = useState<string | null>(null);
  const [valor, setValor] = useState("");
  const [forma, setForma] = useState(formas[0] ?? "Dinheiro");
  const [msg, setMsg] = useState<string | null>(null);
  const [soAbertos, setSoAbertos] = useState(true);
  // Baixa sem entrar no caixa: valor, motivo da lista e, em "Outro", o texto.
  const [baixaValor, setBaixaValor] = useState("");
  const [motivo, setMotivo] = useState(MOTIVOS_BAIXA[0]);
  const [motivoTxt, setMotivoTxt] = useState("");

  const lista = clientes.filter((c) => !soAbertos || c.saldo > 0.005);

  async function baixarSemCaixa(c: ClienteFiado) {
    const v = Math.round(num(baixaValor) * 100) / 100;
    if (!(v > 0)) { setMsg("Informe o valor da baixa."); return; }
    if (v > c.saldo + 0.005) { setMsg(`A baixa (${brl(v)}) é maior que o saldo (${brl(c.saldo)}).`); return; }
    const texto = motivo === "Outro" ? motivoTxt.trim() : motivo;
    if (texto.length < 3) { setMsg("Escreva o motivo da baixa."); return; }
    if (!await confirmar(`Dar baixa de ${brl(v)} no saldo de ${c.nome}, sem entrar no caixa?`, { detalhe: `Motivo: ${texto}. Nada entra no caixa nem no faturamento.`, okTexto: "Dar baixa" })) return;
    try {
      const r = await baixarFiadoSemCaixa(c.id, v, texto);
      if (r.ok) { setMsg(`✓ Baixa de ${brl(v)} no saldo de ${c.nome} (${texto}).`); setAberto(null); setBaixaValor(""); setMotivoTxt(""); router.refresh(); }
      else setMsg(r.mensagem || "Não deu certo.");
    } catch { setMsg("Sem conexão. Tente de novo."); }
  }

  async function receber(c: ClienteFiado) {
    const v = Math.round(num(valor) * 100) / 100;
    if (!(v > 0)) { setMsg("Informe o valor."); return; }
    if (v > c.saldo + 0.005 && !await confirmar(`O valor (${brl(v)}) é maior que o saldo (${brl(c.saldo)}). Continuar?`)) return;
    start(async () => {
      try {
        const r = await receberFiado(c.id, v, forma);
        if (r.ok) { setMsg(`✓ Recebido ${brl(v)} de ${c.nome} em ${forma}.`); setAberto(null); setValor(""); router.refresh(); }
        else setMsg(r.mensagem || "Não deu certo.");
      } catch { setMsg("Sem conexão. Tente de novo."); }
    });
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm text-texto-suave">
          <input type="checkbox" checked={soAbertos} onChange={(e) => setSoAbertos(e.target.checked)} /> só com saldo em aberto
        </label>
        {msg && <p className="text-sm text-emerald-700 dark:text-emerald-400">{msg}</p>}
      </div>
      {lista.length === 0 ? (
        <p className="rounded-cartao bg-painel-cartao p-8 text-center text-sm text-texto-suave">Nenhum cliente com fiado.</p>
      ) : (
        <div className="space-y-2">
          {lista.map((c) => (
            <div key={c.id} className="cartao p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-texto">{c.nome}</p>
                  {c.telefone && <p className="text-xs text-texto-suave">{c.telefone}</p>}
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-lg font-bold ${c.saldo > 0.005 ? "text-red-600" : "text-emerald-600"}`}>{brl(c.saldo)}</span>
                  {c.saldo > 0.005 && aberto !== c.id && (
                    <button onClick={() => { setAberto(c.id); setValor(c.saldo.toFixed(2).replace(".", ",")); setBaixaValor(c.saldo.toFixed(2).replace(".", ",")); setMsg(null); }} className="rounded-controle bg-texto px-3 py-1.5 text-sm font-semibold text-fundo">
                      Receber
                    </button>
                  )}
                  <button onClick={() => setAberto(aberto === c.id ? null : c.id)} className="text-sm text-texto-suave underline">{aberto === c.id ? "fechar" : "histórico"}</button>
                </div>
              </div>
              {aberto === c.id && (
                <div className="mt-3 space-y-2 border-t border-borda pt-3">
                  {c.saldo > 0.005 && (
                    <div className="flex flex-wrap items-center gap-2 rounded-controle bg-emerald-500/10 p-2">
                      <span className="text-sm font-medium">Receber</span>
                      <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" className="w-28 rounded-controle border border-borda-forte bg-painel-cartao px-2 py-1 text-right text-sm" />
                      <select value={forma} onChange={(e) => setForma(e.target.value)} className="rounded-controle border border-borda-forte bg-painel-cartao px-2 py-1 text-sm">
                        {formas.map((f) => <option key={f}>{f}</option>)}
                      </select>
                      <button onClick={() => receber(c)} disabled={pend} className="rounded-controle bg-texto px-3 py-1 text-sm font-semibold text-fundo disabled:opacity-50">{pend ? "…" : "Confirmar"}</button>
                    </div>
                  )}
                  {c.saldo > 0.005 && (
                    <div className="rounded-controle bg-superficie-suave p-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-texto">Dar baixa sem entrar no caixa</span>
                        <input value={baixaValor} onChange={(e) => setBaixaValor(e.target.value)} inputMode="decimal" aria-label="Valor da baixa"
                          placeholder={c.saldo.toFixed(2).replace(".", ",")} className="min-h-11 w-28 rounded-controle border border-borda-forte bg-painel-cartao px-2 text-right text-sm" />
                        <select value={motivo} onChange={(e) => setMotivo(e.target.value)} aria-label="Motivo da baixa" className="min-h-11 rounded-controle border border-borda-forte bg-painel-cartao px-2 text-sm">
                          {MOTIVOS_BAIXA.map((m) => <option key={m}>{m}</option>)}
                        </select>
                        {motivo === "Outro" && (
                          <input value={motivoTxt} onChange={(e) => setMotivoTxt(e.target.value)} placeholder="Qual o motivo?" aria-label="Motivo escrito"
                            className="min-h-11 min-w-48 flex-1 rounded-controle border border-borda-forte bg-painel-cartao px-2 text-sm" />
                        )}
                        <BotaoAcao aoClicar={() => baixarSemCaixa(c)} className="btn-secundario !min-h-11 text-sm">Dar baixa</BotaoAcao>
                      </div>
                      <p className="mt-1 text-xs text-texto-suave">Pra troca de serviço ou cortesia: tira do saldo e não lança nada no caixa.</p>
                    </div>
                  )}
                  <ul className="space-y-0.5 text-sm">
                    {c.lancamentos.map((l) => (
                      <li key={l.id} className="flex justify-between gap-2 text-texto-suave">
                        <span>{l.quando} · <Icone nome={l.tipo === "debito" ? "cupom" : "dinheiro"} tamanho={12} className="mr-1" />{l.descricao ?? (l.tipo === "debito" ? "Venda fiada" : "Pagamento")}{l.forma ? ` (${l.forma})` : ""}</span>
                        <span className={l.tipo === "debito" ? "text-red-600" : "text-emerald-600"}>{l.tipo === "debito" ? "+" : "−"} {brl(l.valor)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
