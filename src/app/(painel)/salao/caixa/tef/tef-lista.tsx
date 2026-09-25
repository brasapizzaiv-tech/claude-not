"use client";

import { Icone } from "@/components/icone";
import { confirmar } from "@/components/dialogo";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { tefAdm, tefCancelar, tefConfirmar, tefDisponivel, tefPix, type TefStatus } from "@/lib/tef-client";
import { registrarCancelamentoTef, registrarPixTeste, reimprimirTef } from "../../actions";

export type TefLinha = {
  id: string;
  tipo: string | null;
  valor: number;
  parcelas: number;
  rede: string | null;
  bandeira: string | null;
  nsu: string | null;
  autorizacao: string | null;
  status: string;
  mensagem: string | null;
  pan_mascarado: string | null;
  terminal: string | null;
  criado_em: string;
  /** Nulo quando a cobranca nao passou pelo caixa (Pix avulso do pinpad). */
  mov_id?: string | null;
};

const brl = (n: number) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const quando = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
// Data da venda no formato que o gerenciador pede no cancelamento (DDMMAAAA).
const dataTef = (iso: string) => {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).formatToParts(new Date(iso));
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("day")}${g("month")}${g("year")}`;
};
// A mesma data, do jeito que o operador lê (pra digitar na janela da Elgin).
const dataBr = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
const STATUS: Record<string, { rotulo: string; cls: string }> = {
  confirmada: { rotulo: "aprovada", cls: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300" },
  aprovada: { rotulo: "aprovada (sem confirmar)", cls: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200" },
  cancelada: { rotulo: "cancelada", cls: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" },
  desfeita: { rotulo: "desfeita", cls: "bg-superficie-suave text-texto-suave " },
  negada: { rotulo: "negada", cls: "bg-superficie-suave text-texto-suave " },
  erro: { rotulo: "erro", cls: "bg-superficie-suave text-texto-suave " },
};

export function TefLista({ linhas }: { linhas: TefLinha[] }) {
  const router = useRouter();
  const [proc, start] = useTransition();
  const [agente, setAgente] = useState<TefStatus | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupadoId, setOcupadoId] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    const ver = async () => { const s = await tefDisponivel(); if (vivo) setAgente(s); };
    ver();
    const t = setInterval(ver, 15000);
    return () => { vivo = false; clearInterval(t); };
  }, []);

  function reimprimir(l: TefLinha) {
    setMsg(null);
    start(async () => {
      const r = await reimprimirTef(l.id);
      setMsg(r.ok ? `✓ Via do cliente (NSU ${l.nsu ?? "-"}) mandada pra impressora.` : r.mensagem);
    });
  }

  async function cancelar(l: TefLinha) {
    if (!agente) { setMsg("O Agente TEF não está rodando neste PC — o cancelamento precisa do pinpad."); return; }
    if (!l.nsu) { setMsg("Essa transação não tem NSU, não dá pra cancelar pelo TEF."); return; }
    // Cobrança que não passou pelo caixa (o Pix avulso do pinpad) não gera
    // estorno lá — prometer isso no aviso seria mentira.
    const doCaixa = !!l.mov_id;
    const aviso = doCaixa
      ? "O valor sai do caixa e a via do cancelamento é impressa."
      : "Essa cobrança não entrou no caixa, então nada sai de lá — só a via do cancelamento é impressa.";
    // A armadilha que derrubou o terminal em 16/09: a janela da Elgin pediu a
    // senha de supervisor, o operador fechou a janela sem digitar, e o Hub
    // executou "Manutenção" — desativou o terminal na adquirente. Só volta com
    // a Elgin reprovisionando. Então o aviso diz o que fazer nessa hora.
    const armadilha =
      'ATENÇÃO: se a janela da Elgin pedir SENHA DE SUPERVISOR, NÃO feche a janela nem aperte Esc — fechar sem a senha DESATIVA o terminal. Digite a senha ou responda "Não" na pergunta anterior.';
    if (!await confirmar(`Cancelar a venda de ${brl(l.valor)} (NSU ${l.nsu})?\n\nO pinpad vai pedir o cartão do cliente de novo. ${aviso}\n\n${armadilha}`)) return;
    // O NSU vai na requisição (012-000); se mesmo assim a janela da Elgin
    // perguntar a data ou o "Número do Documento", a tela já diz o que responder.
    setMsg(`Olhe a janela da Elgin e peça o cartão ao cliente. Se ela perguntar a data da venda, é ${dataBr(l.criado_em)}; se perguntar o "Número do Documento", é o NSU ${l.nsu}. Tem até 10 minutos.`);
    setOcupadoId(l.id);
    start(async () => {
      try {
        const r = await tefCancelar({ nsu: l.nsu!, valor: Number(l.valor), data: dataTef(l.criado_em) });
        if (!r.ok) { setMsg(r.erro ?? "O agente não respondeu."); return; }
        if (!r.aprovada) { setMsg(`Cancelamento não aprovado: ${r.mensagem || "sem detalhe"}.`); return; }
        const g = await registrarCancelamentoTef(l.id, {
          nsu: r.nsu ?? null, autorizacao: r.autorizacao ?? null, rede: r.rede ?? null, bandeira: r.bandeira ?? null,
          viaCliente: r.viaCliente ?? [], viaLoja: r.viaLoja ?? [], idAgente: r.idAgente ?? null, terminal: r.terminal ?? null,
        });
        setMsg(g.ok ? `✓ Venda de ${brl(l.valor)} cancelada. Via do cancelamento mandada pra impressora.` : g.mensagem);
        router.refresh();
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Falha ao falar com o agente.");
      } finally {
        setOcupadoId(null);
      }
    });
  }

  function adm() {
    if (!agente) { setMsg("O Agente TEF não está rodando neste PC."); return; }
    // "Manutenção" nesse menu desativa o terminal na adquirente (foi o que
    // aconteceu em 16/09) e só a Elgin reativa. Quem abre o menu precisa saber.
    setMsg('Abrindo o menu administrativo do gerenciador… olhe a janela da Elgin. CUIDADO: a opção "Manutenção" DESATIVA o terminal — só a Elgin reativa.');
    start(async () => {
      try {
        const r = await tefAdm();
        setMsg(r.ok ? `Menu administrativo: ${r.mensagem || "encerrado"}.` : (r.erro ?? "O agente não respondeu."));
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Falha ao falar com o agente.");
      }
    });
  }

  // PIX PELO PINPAD
  //
  // Fica aqui, e não no caixa, de propósito. O Pix do dia a dia é o do Sicoob,
  // que não tem taxa; este passa pela adquirente e tem. Existe porque é item do
  // roteiro de homologação da Elgin, e porque serve de reserva se o Sicoob cair.
  //
  // Pede o valor e cobra: o gerenciador desenha o QR na tela do pinpad. Não
  // registra pagamento nenhum no caixa — é uma cobrança avulsa, de teste.
  function pix() {
    if (!agente) { setMsg("O Agente TEF não está rodando neste PC."); return; }
    const digitado = window.prompt("Valor do Pix pelo pinpad (só pra teste — não entra no caixa):", "1,00");
    if (digitado === null) return;
    const valor = Number(digitado.replace(/\./g, "").replace(",", "."));
    if (!(valor > 0)) { setMsg("Valor inválido."); return; }
    setMsg("Mandei pro pinpad — o QR aparece na tela dele. Esperando o cliente pagar…");
    start(async () => {
      try {
        const r = await tefPix({ valor });
        if (!r.ok) { setMsg(r.erro ?? "O agente não respondeu."); return; }
        if (!r.aprovada) {
          // A recusa mais comum tem causa conhecida e manda procurar no lugar
          // certo — sem a dica, se perde tempo do lado errado.
          const msg = r.mensagem ?? "";
          const dica = /habilita/i.test(msg)
            // "Erro ao obter os dados de habilitação": o gerenciador processou,
            // mas o Pix não está liberado pra esse CNPJ na adquirente.
            ? " O Pix não está habilitado pra esse CNPJ — isso é liberação da Elgin/adquirente, não é ajuste aqui."
            : "";
          setMsg(`Pix não aprovado: ${msg || "recusado"}.${dica}`);
          return;
        }
        // Aprovou: confirma na hora. Aqui não há venda pra gravar antes — é
        // cobrança avulsa —, então o CNF vai direto, senão o gerenciador desfaz.
        if (r.requerConfirmacao && r.idAgente) await tefConfirmar(r.idAgente);
        // E guarda na lista: é o que permite CANCELAR esse Pix depois (item do
        // roteiro). Não entra no caixa — fica com mov_id nulo.
        const g = await registrarPixTeste({
          valor, nsu: r.nsu ?? null, nsuHost: r.nsuHost ?? null, autorizacao: r.autorizacao ?? null,
          rede: r.rede ?? null, bandeira: r.bandeira ?? null, produto: r.produto ?? null,
          viaCliente: r.viaCliente ?? [], viaLoja: r.viaLoja ?? [], idAgente: r.idAgente ?? null,
          terminal: r.terminal ?? null,
        });
        setMsg(
          `Pix aprovado · NSU ${r.nsu ?? "-"} · ${r.rede ?? ""}. Confirmado.` +
            (g.ok ? " Está na lista abaixo, dá pra cancelar." : ` (não consegui guardar na lista: ${g.mensagem})`),
        );
        router.refresh();
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Falha ao falar com o agente.");
      }
    });
  }

  const btn = "rounded-controle border border-borda-forte px-3 py-1.5 text-xs font-medium text-texto-suave hover:bg-superficie-suave disabled:opacity-40 dark:border-borda-forte  ";

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${agente ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300" : "bg-superficie-suave text-texto-suave "}`}>
          {agente ? `Agente TEF ${agente.versao} · ${agente.terminal}${agente.gerenciador ? " · gerenciador OK" : " · gerenciador não encontrado"}` : "Agente TEF não encontrado neste PC"}
        </span>
        <button onClick={adm} disabled={proc || !agente} className={btn}><span className="inline-flex items-center gap-1.5"><Icone nome="ajustes" tamanho={14} /> Menu administrativo (Elgin)</span></button>
        <button onClick={pix} disabled={proc || !agente} className={btn}><span className="inline-flex items-center gap-1.5"><Icone nome="celular" tamanho={14} /> Pix pelo pinpad (teste)</span></button>
      </div>
      {msg && <p className="mb-3 rounded-controle bg-superficie-suave px-3 py-2 text-sm text-texto-suave">{msg}</p>}

      <div className="overflow-x-auto rounded-cartao bg-painel-cartao">
        <table className="min-w-[720px] w-full text-sm">
          <thead className="bg-superficie-suave text-left text-xs text-texto-suave">
            <tr>
              <th className="px-3 py-2">Quando</th>
              <th className="px-3 py-2">Cartão</th>
              <th className="px-3 py-2 text-right">Valor</th>
              <th className="px-3 py-2">NSU / Aut.</th>
              <th className="px-3 py-2">Situação</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borda">
            {linhas.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-texto-fraco">Nenhum cartão passado no pinpad nos últimos 7 dias.</td></tr>
            )}
            {linhas.map((l) => {
              const st = STATUS[l.status] ?? { rotulo: l.status, cls: "bg-superficie-suave text-texto-suave" };
              const podeCancelar = l.status === "confirmada" && !!l.nsu;
              const podeImprimir = l.status === "confirmada" || l.status === "cancelada";
              return (
                <tr key={l.id} className="text-zinc-800 dark:text-zinc-100">
                  <td className="px-3 py-2 tabular-nums text-texto-suave">{quando(l.criado_em)}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{l.bandeira ?? "—"} <span className="text-xs text-texto-fraco">{l.tipo}{l.parcelas > 1 ? ` ${l.parcelas}x` : ""}</span></div>
                    <div className="text-xs text-texto-fraco">{l.rede ?? ""}{l.pan_mascarado ? ` · ${l.pan_mascarado}` : ""}</div>
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{brl(l.valor)}</td>
                  <td className="px-3 py-2 tabular-nums text-texto-suave">{l.nsu ?? "—"}{l.autorizacao ? ` / ${l.autorizacao}` : ""}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-mini font-medium ${st.cls}`}>{st.rotulo}</span>
                    {l.mensagem && <div className="mt-0.5 max-w-[260px] truncate text-mini text-texto-fraco" title={l.mensagem}>{l.mensagem}</div>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1.5">
                      {podeImprimir && <button onClick={() => reimprimir(l)} disabled={proc} className={btn}><span className="inline-flex items-center gap-1.5"><Icone nome="imprimir" tamanho={14} /> Reimprimir</span></button>}
                      {podeCancelar && (
                        <button onClick={() => cancelar(l)} disabled={proc || !agente} className="rounded-controle border border-red-400 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40 dark:hover:bg-red-950">
                          {ocupadoId === l.id ? "No pinpad…" : <span className="inline-flex items-center gap-1.5"><Icone nome="fechar" tamanho={13} /> Cancelar</span>}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
