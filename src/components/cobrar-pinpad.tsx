"use client";

// Cobrança no pinpad (TEF) pra telas que vendem com UM pagamento só: PDV de
// balcão e o "Receber" do delivery/retirada (pedido do Rafael, 12/10/2026: o
// cliente que vem retirar decide pagar no Pix na hora). O caixa do salão tem a
// sua versão dentro do PainelPagamentos, com vários pagamentos na conta.
//
// Ordem, igual ao caixa: (1) cobra no pinpad; (2) `aoAprovar` grava a venda no
// servidor levando os dados do TEF; (3) gravou → confirma (CNF) no pinpad e
// fecha a transação; não gravou → DESFAZ no pinpad, pra não ficar cobrado.
import { useEffect, useState } from "react";
import { Icone } from "@/components/icone";
import { tefConfirmar, tefDesfazer, tefDisponivel, tefPix, tefVenda, type TefDados, type TefStatus } from "@/lib/tef-client";
import { fecharTef } from "@/app/(painel)/salao/actions";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Agente TEF neste PC? Procura ao abrir e de 15 em 15 s. */
export function useAgenteTef() {
  const [tef, setTef] = useState<TefStatus | null>(null);
  useEffect(() => {
    let vivo = true;
    const olhar = async () => { const s = await tefDisponivel(); if (vivo) setTef(s); };
    const t0 = setTimeout(olhar, 0);
    const t = setInterval(olhar, 15000);
    return () => { vivo = false; clearTimeout(t0); clearInterval(t); };
  }, []);
  return tef;
}

export function CobrarPinpad({
  tipo,
  valor,
  agente,
  desabilitado,
  aoAprovar,
  aoTerminar,
}: {
  tipo: "credito" | "debito" | "voucher" | "pix";
  valor: number;
  agente: TefStatus;
  desabilitado?: boolean;
  /** Grava a venda com o TEF; devolve o id da transação pra confirmar. */
  aoAprovar: (tef: TefDados) => Promise<{ ok: boolean; transacaoId?: string | null; mensagem?: string }>;
  aoTerminar?: () => void;
}) {
  const [etapa, setEtapa] = useState<"" | "pinpad" | "gravando">("");
  const [aviso, setAviso] = useState<string | null>(null);
  const ehPix = tipo === "pix";

  async function cobrar() {
    if (etapa || !(valor > 0.005)) return;
    setAviso(null);
    setEtapa("pinpad");
    try {
      const r = ehPix ? await tefPix({ valor }) : await tefVenda({ valor, tipo, parcelas: 1 });
      if (!r.ok) { setAviso(r.erro || "O TEF não respondeu."); return; }
      if (!r.aprovada) { setAviso(`${ehPix ? "Pix" : "Cartão"} não aprovado: ${r.mensagem || "recusado"}.`); return; }
      const dados: TefDados = {
        idAgente: r.idAgente || "",
        terminal: r.terminal ?? null,
        nsu: r.nsu ?? null,
        nsuHost: r.nsuHost ?? null,
        autorizacao: r.autorizacao ?? null,
        rede: r.rede ?? null,
        bandeira: r.bandeira ?? null,
        produto: r.produto ?? null,
        tipo,
        parcelas: 1,
        panMascarado: r.panMascarado ?? null,
        viaCliente: r.viaCliente ?? [],
        viaLoja: r.viaLoja ?? [],
        requerConfirmacao: !!r.requerConfirmacao,
        confirmado: false,
      };
      setEtapa("gravando");
      let g: Awaited<ReturnType<typeof aoAprovar>>;
      try {
        g = await aoAprovar(dados);
      } catch {
        g = { ok: false, mensagem: "Sem conexão ao gravar a venda." };
      }
      if (!g.ok) {
        try { await tefDesfazer(dados.idAgente, g.mensagem || "a venda não gravou"); } catch { /* o agente desfaz sozinho na próxima */ }
        setAviso(`${g.mensagem || "A venda não gravou."} A cobrança no ${ehPix ? "Pix" : "cartão"} foi DESFEITA.`);
        return;
      }
      let confirmou = false;
      try { confirmou = (await tefConfirmar(dados.idAgente)).ok; } catch { confirmou = false; }
      if (g.transacaoId) {
        try { await fecharTef(g.transacaoId, confirmou, confirmou ? undefined : "o agente não confirmou (CNF)"); } catch { /* fica aprovada; aparece em Cartões (TEF) */ }
      }
      aoTerminar?.();
    } catch {
      setAviso("O agente TEF não respondeu. Confira o ícone na bandeja.");
    } finally {
      setEtapa("");
    }
  }

  return (
    <div className="rounded-cartao border border-emerald-600/40 bg-emerald-50 p-3 dark:bg-emerald-950/30">
      {etapa ? (
        <div className="text-center">
          <p className="text-base font-bold text-emerald-800 dark:text-emerald-300">
            {etapa === "gravando" ? "Aprovado — registrando a venda…" : ehPix ? "Aguardando o Pix no pinpad…" : "Aguardando o cartão no pinpad…"}
          </p>
          {etapa === "pinpad" && (
            <p className="mt-1 text-xs text-emerald-700/80 dark:text-emerald-400/80">
              {ehPix
                ? "O cliente lê o QR da maquininha com o app do banco. Assim que pagar, entra sozinho. Pra desistir, cancele no pinpad."
                : "O cliente insere ou aproxima o cartão e digita a senha. Pra desistir, cancele no pinpad."}
            </p>
          )}
        </div>
      ) : (
        <>
          <button
            onClick={cobrar}
            disabled={desabilitado || !(valor > 0.005)}
            className="w-full rounded-cartao bg-texto py-3 text-base font-bold text-fundo hover:opacity-90 disabled:opacity-50"
          >
            <span className="inline-flex items-center justify-center gap-1.5">
              <Icone nome={ehPix ? "rapido" : "cartao"} tamanho={16} />
              {ehPix ? "Mostrar QR na maquininha" : "Passar no cartão"} · {brl(valor)}
            </span>
          </button>
          <p className="mt-1.5 text-center text-mini text-emerald-800/70 dark:text-emerald-400/70">
            Pinpad {agente.terminal}{agente.gerenciador ? "" : " · gerenciador de TEF não encontrado neste PC"}.
          </p>
        </>
      )}
      {aviso && <p className="mt-2 text-sm font-medium text-red-600">{aviso}</p>}
    </div>
  );
}
