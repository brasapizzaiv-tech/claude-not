"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import QRCode from "qrcode";
import { gerarPixCaixa, consultarPixCaixa, encerrarPixCaixa } from "@/app/(painel)/salao/pix-actions";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// QR Code Pix pro caixa: gera a cobrança, mostra o QR e fica conferindo no
// banco a cada 3 s. Quando cai, chama onPago (que fecha a conta como "Pix").
export function PixQr({
  valor,
  descricao,
  origem,
  onPago,
  compacto,
}: {
  valor: number;
  descricao: string;
  origem: "caixa" | "pdv";
  onPago: () => void;
  compacto?: boolean;
}) {
  const [cob, setCob] = useState<{ txid: string; copiaECola: string; valor: number } | null>(null);
  const [src, setSrc] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pago, setPago] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [gerando, start] = useTransition();
  const [falhas, setFalhas] = useState(0);
  const onPagoRef = useRef(onPago);
  useEffect(() => {
    onPagoRef.current = onPago;
  }, [onPago]);
  // Estado atual em ref, pra limpeza ao desmontar (sem closure velha).
  const atualRef = useRef<{ txid: string; pago: boolean } | null>(null);
  useEffect(() => {
    atualRef.current = cob ? { txid: cob.txid, pago } : null;
  }, [cob, pago]);
  // Saiu da tela (fechou a conta de outro jeito, trocou a forma): cancela a
  // cobrança pendente pra não sobrar um QR "fantasma" pagável por 30 min.
  useEffect(() => {
    return () => {
      const a = atualRef.current;
      if (a && !a.pago) encerrarPixCaixa(a.txid, "cancelado").catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (!cob) return;
    let vivo = true;
    QRCode.toDataURL(cob.copiaECola, { width: compacto ? 220 : 280, margin: 1 })
      .then((d) => { if (vivo) setSrc(d); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [cob, compacto]);

  // Consulta o banco a cada 3 s enquanto o QR está na tela.
  useEffect(() => {
    if (!cob || pago) return;
    let vivo = true;
    const t = setInterval(async () => {
      try {
        const r = await consultarPixCaixa(cob.txid);
        if (!vivo) return;
        if (r.ok && r.pago) {
          setPago(true);
          clearInterval(t);
          onPagoRef.current();
          return;
        }
        setFalhas(r.ok ? 0 : (f) => f + 1);
      } catch {
        if (vivo) setFalhas((f) => f + 1);
      }
    }, 3000);
    return () => { vivo = false; clearInterval(t); };
  }, [cob, pago]);

  // Valor mudou depois de gerar (desconto, outro item): o QR antigo não serve
  // mais — cancela na hora e pede pra gerar outro (senão o cliente paga o valor velho).
  useEffect(() => {
    if (!cob || pago || Math.abs(cob.valor - valor) <= 0.005) return;
    const t = setTimeout(() => {
      encerrarPixCaixa(cob.txid, "cancelado").catch(() => {});
      setCob(null);
      setSrc("");
      setErro(`O valor mudou para ${brl(valor)} — o QR anterior foi cancelado. Gere outro.`);
    }, 0);
    return () => clearTimeout(t);
  }, [valor, cob, pago]);

  function gerar() {
    setErro(null);
    start(async () => {
      const r = await gerarPixCaixa(valor, descricao, origem);
      if (r.ok) setCob({ txid: r.txid, copiaECola: r.copiaECola, valor });
      else setErro(r.erro);
    });
  }
  async function cancelar() {
    if (cob) await encerrarPixCaixa(cob.txid, "cancelado").catch(() => {});
    setCob(null); setSrc(""); setPago(false);
  }
  async function confirmarNaMao() {
    if (cob) await encerrarPixCaixa(cob.txid, "pago").catch(() => {});
    setPago(true);
    onPagoRef.current();
  }
  function copiar() {
    if (!cob) return;
    try {
      navigator.clipboard.writeText(cob.copiaECola);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {}
  }

  if (!cob) {
    return (
      <div className="space-y-1">
        <button
          type="button"
          onClick={gerar}
          disabled={gerando || !(valor > 0)}
          className="w-full rounded-lg border-2 border-emerald-500 bg-emerald-500/10 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-500/20 disabled:opacity-50 dark:text-emerald-400"
        >
          {gerando ? "Gerando QR…" : `💠 Gerar QR Code Pix de ${brl(valor)}`}
        </button>
        {erro && <p className="text-xs text-amber-700 dark:text-amber-400">{erro.startsWith("O valor mudou") ? erro : `Não deu pra gerar o QR: ${erro}. Receba o Pix pela chave, como antes.`}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-emerald-300 bg-white p-3 text-center dark:border-emerald-800 dark:bg-zinc-950">
      {pago ? (
        <p className="py-4 text-lg font-bold text-emerald-600">✅ Pix recebido!</p>
      ) : (
        <>
          <p className="text-xs text-zinc-500">Mostre o QR pro cliente</p>
          <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{brl(cob.valor)}</p>
          {src && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt="QR Code Pix" className={`mx-auto ${compacto ? "h-52 w-52" : "h-64 w-64"} rounded-lg bg-white p-1`} />
          )}
          <p className="mt-1 animate-pulse text-xs text-emerald-600">⏳ Aguardando o pagamento… confere sozinho.</p>
          {falhas >= 4 && (
            <p className="mt-1 text-xs font-semibold text-amber-600">⚠️ Não estou conseguindo consultar o banco. Se o cliente mostrar o comprovante, use &quot;Vi que caiu&quot;.</p>
          )}
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <button type="button" onClick={copiar} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs dark:border-zinc-700">
              {copiado ? "✓ Copiado" : "Copiar código"}
            </button>
            <button type="button" onClick={confirmarNaMao} className="rounded-lg border border-emerald-500 px-3 py-1.5 text-xs text-emerald-700 dark:text-emerald-400">
              Vi que caiu, confirmar
            </button>
            <button type="button" onClick={cancelar} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs text-zinc-500 dark:border-zinc-700">
              Cancelar QR
            </button>
          </div>
        </>
      )}
    </div>
  );
}
