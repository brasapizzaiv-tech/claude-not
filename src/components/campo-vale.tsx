"use client";

// Campo "código do vale-presente" do caixa e do PDV (migration 0235): digita
// (ou lê o QR com o leitor), confere no servidor e mostra pra quem é, o saldo
// e a validade. Vale de papel antigo, sem código, ainda passa pelo motivo.
import { useState } from "react";
import { consultarVale, type ValeConsulta } from "@/app/(painel)/salao/caixa/vales/actions";
import { dataBR, formatarCodigo } from "@/lib/vale-presente";
import { BotaoAcao } from "@/components/enviar";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function CampoVale({
  vale,
  onVale,
  semCodigo,
  onSemCodigo,
  campoCls,
}: {
  vale: ValeConsulta | null;
  onVale: (v: ValeConsulta | null) => void;
  semCodigo: boolean;
  onSemCodigo: (s: boolean) => void;
  campoCls: string;
}) {
  const [codigo, setCodigo] = useState("");
  const [proc, setProc] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function conferir() {
    if (proc || !codigo.trim()) return;
    setProc(true);
    setErro(null);
    try {
      const r = await consultarVale(codigo);
      if (r.ok) onVale(r.vale);
      else { onVale(null); setErro(r.mensagem); }
    } catch {
      setErro("Sem conexão. Tente de novo.");
    } finally {
      setProc(false);
    }
  }

  if (semCodigo) {
    return (
      <p className="mt-3 text-mini text-texto-fraco">
        Vale antigo, sem código: escreva o número/observação no motivo abaixo.{" "}
        <button type="button" onClick={() => onSemCodigo(false)} className="font-semibold text-primaria underline">Usar código</button>
      </p>
    );
  }

  return (
    <div className="mt-3">
      <label className="block text-mini text-texto-fraco">
        Código do vale
        <div className="mt-1 flex gap-2">
          <input
            value={codigo}
            onChange={(e) => { setCodigo(e.target.value.toUpperCase().slice(0, 14)); if (vale) onVale(null); setErro(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void conferir(); } }}
            placeholder="ex.: K7P2-M9QX"
            autoFocus
            autoComplete="off"
            className={`${campoCls} font-mono uppercase tracking-wider`}
          />
          <BotaoAcao aoClicar={conferir} disabled={!codigo.trim()} className="shrink-0 rounded-controle bg-texto px-4 text-sm font-semibold text-fundo disabled:opacity-40">
            Conferir
          </BotaoAcao>
        </div>
      </label>
      {vale && (
        <div className="mt-2 rounded-controle border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
          <div className="font-semibold">Vale {formatarCodigo(vale.codigo)} · saldo {brl(vale.saldo)}</div>
          <div className="text-xs">
            {vale.para ? `Para ${vale.para}` : "Sem nome"}{vale.de ? ` · de ${vale.de}` : ""} · válido até {dataBR(vale.validade)}
          </div>
        </div>
      )}
      {erro && <p className="mt-1 text-xs font-medium text-red-600">{erro}</p>}
      <button type="button" onClick={() => { onVale(null); onSemCodigo(true); }} className="mt-1 text-mini text-texto-fraco underline">
        Vale antigo, sem código
      </button>
    </div>
  );
}
