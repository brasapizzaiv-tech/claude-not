"use client";

// Contagem de dinheiro nota por nota. Cada linha aceita a quantidade ou o valor, e
// um preenche o outro: "12" notas de R$ 50 ou "600,00" dão no mesmo. Usada no
// fechamento do caixa e no Cofre.
import { useRef, useState, type KeyboardEvent } from "react";
import { DENOMINACOES, ehMoeda, moedaOuNota, qtdDoValor, rotuloDen, type Quantidades } from "@/lib/cofre";

const emReais = (cent: number) => (cent / 100).toFixed(2).replace(".", ",");
const CAMPO = "min-h-11 w-full min-w-0 rounded-controle border border-borda bg-painel-cartao px-2 text-right font-numero";

type Props = {
  valor: Quantidades;
  onChange: (q: Quantidades) => void;
  saldo?: Quantidades;
  mostrarSaldo?: boolean;
  /** Notas e moedas lado a lado, em janela larga. */
  lado?: boolean;
  focoInicial?: boolean;
  /** Avisa quando algum valor digitado não fecha em notas inteiras. */
  aoMudarErro?: (temErro: boolean) => void;
};

export function ContagemNotas({ valor, onChange, saldo, mostrarSaldo, lado, focoInicial, aoMudarErro }: Props) {
  // O que a pessoa está digitando em Valor, antes de virar quantidade.
  const [rascunho, setRascunho] = useState<Record<string, string>>({});
  const caixa = useRef<HTMLDivElement>(null);

  const invalido = (c: number, r: Record<string, string>) => r[String(c)] !== undefined && qtdDoValor(c, r[String(c)]) === null;

  function atualizarRascunho(novo: Record<string, string>) {
    setRascunho(novo);
    aoMudarErro?.(DENOMINACOES.some((c) => invalido(c, novo)));
  }

  function porQuantidade(c: number, texto: string) {
    const n = Math.max(0, Math.trunc(Number(texto.replace(/\D/g, "")) || 0));
    const novo = { ...valor };
    if (n) novo[String(c)] = n; else delete novo[String(c)];
    onChange(novo);
    const r = { ...rascunho };
    delete r[String(c)];
    atualizarRascunho(r);
  }

  function porValor(c: number, texto: string) {
    atualizarRascunho({ ...rascunho, [String(c)]: texto });
    const n = qtdDoValor(c, texto);
    const novo = { ...valor };
    if (n) novo[String(c)] = n; else delete novo[String(c)];
    onChange(novo);
  }

  // Valor que fechou certo volta a aparecer formatado ao sair do campo.
  function aoSairDoValor(c: number) {
    if (rascunho[String(c)] === undefined || invalido(c, rascunho)) return;
    const r = { ...rascunho };
    delete r[String(c)];
    atualizarRascunho(r);
  }

  // Enter desce na mesma coluna: quem conta por quantidade não passa pelo Valor.
  function aoTeclar(e: KeyboardEvent<HTMLInputElement>, coluna: string) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const campos = [...(caixa.current?.querySelectorAll<HTMLInputElement>(`input[data-coluna="${coluna}"]`) ?? [])];
    campos[campos.indexOf(e.currentTarget) + 1]?.focus();
  }

  const linha = (c: number, primeira: boolean) => {
    const k = String(c);
    const erro = invalido(c, rascunho);
    const nome = `${moedaOuNota(c)} de ${rotuloDen(c)}`;
    return (
      <div key={c} className="grid grid-cols-[4.5rem_1fr_1fr] items-center gap-2">
        <span className="whitespace-nowrap text-sm font-semibold text-texto">
          {rotuloDen(c)}
          {mostrarSaldo && <span className="block text-xs font-normal text-texto-fraco">tem {saldo?.[k] ?? 0}</span>}
        </span>
        <input
          inputMode="numeric"
          autoFocus={focoInicial && primeira}
          data-coluna="qtd"
          aria-label={`Quantidade de ${nome}`}
          value={valor[k] ? String(valor[k]) : ""}
          onChange={(e) => porQuantidade(c, e.target.value)}
          onKeyDown={(e) => aoTeclar(e, "qtd")}
          placeholder="0"
          className={CAMPO}
        />
        <input
          inputMode="decimal"
          data-coluna="valor"
          aria-label={`Valor em ${nome}`}
          aria-invalid={erro}
          value={rascunho[k] ?? (valor[k] ? emReais(valor[k] * c) : "")}
          onChange={(e) => porValor(c, e.target.value)}
          onBlur={() => aoSairDoValor(c)}
          onKeyDown={(e) => aoTeclar(e, "valor")}
          placeholder="0,00"
          className={CAMPO}
        />
        {erro && <p role="alert" className="col-span-3 text-xs font-semibold text-urgente-texto">Esse valor não fecha em {moedaOuNota(c)} de {rotuloDen(c)}.</p>}
      </div>
    );
  };

  const bloco = (titulo: string, lista: number[], primeiroBloco: boolean) => (
    <div className="space-y-1.5">
      <div className="grid grid-cols-[4.5rem_1fr_1fr] gap-2">
        <span className="rotulo">{titulo}</span>
        <span className="rotulo text-right">Quantidade</span>
        <span className="rotulo text-right">Valor (R$)</span>
      </div>
      {lista.map((c, i) => linha(c, primeiroBloco && i === 0))}
    </div>
  );

  return (
    <div ref={caixa} className={lado ? "grid gap-4 sm:grid-cols-2" : "space-y-4"}>
      {bloco("Notas", DENOMINACOES.filter((c) => !ehMoeda(c)), true)}
      {bloco("Moedas", DENOMINACOES.filter(ehMoeda), false)}
    </div>
  );
}
