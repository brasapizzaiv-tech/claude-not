"use client";

// Painel de pagamento do caixa, no formato que o Rafael já conhecia do Consumer:
// a conta aceita VÁRIOS pagamentos até "Falta pagar" zerar; cada forma tem uma
// tecla de atalho; ao escolher a forma abre um passo com o valor já selecionado,
// botão de "auto preencher o que falta", cédulas (Shift soma), observação e,
// no cartão, a bandeira. Enter salva, Esc volta.
import { useEffect, useMemo, useRef, useState } from "react";

export type Pagamento = {
  uid: string;
  forma: string;
  valor: number;        // o que entra na conta
  recebido?: number;    // dinheiro: o que o cliente entregou (pra calcular troco)
  bandeira?: string | null;
  observacao?: string | null;
};

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (s: string) => Number(String(s).replace(/\./g, "").replace(",", ".")) || 0;
const cent = (n: number) => Math.round(n * 100) / 100;

// Tecla de atalho por forma (a letra é mostrada no botão).
export function atalhoDaForma(forma: string): string {
  const f = forma.toLowerCase();
  if (f.includes("dinheiro")) return "A";
  if (f.includes("pix")) return "P";
  if (f.includes("créd") || f.includes("cred")) return "C";
  if (f.includes("déb") || f.includes("deb")) return "B";
  if (f.includes("vale") || f.includes("refei")) return "R";
  if (f.includes("saldo") || f.includes("fiado")) return "F";
  return forma.trim().charAt(0).toUpperCase();
}
const ehCartao = (f: string) => /cart|créd|cred|déb|deb/i.test(f);
const ehDinheiro = (f: string) => /dinheiro/i.test(f);
const ehFiado = (f: string) => /saldo|fiado/i.test(f);
const ehPix = (f: string) => /pix/i.test(f);

const ICONE: Record<string, string> = { A: "💵", P: "◈", C: "💳", B: "💳", R: "🍽️", F: "🧾" };
const CEDULAS = [2, 5, 10, 20, 50, 100];
const BANDEIRAS: { tecla: string; nome: string }[] = [
  { tecla: "V", nome: "Visa" },
  { tecla: "M", nome: "Master" },
  { tecla: "E", nome: "Elo" },
  { tecla: "X", nome: "Amex" },
  { tecla: "S", nome: "Outra" },
];

export function PainelPagamentos({
  formas,
  total,
  pagos,
  onAdicionar,
  onRemover,
  ativo,
  fiado,
  qrPix,
}: {
  formas: string[];
  total: number;
  pagos: Pagamento[];
  onAdicionar: (p: Pagamento) => void;
  onRemover: (uid: string) => void;
  ativo: boolean; // a tela está pronta pra receber (tem itens)
  fiado?: { nome: string; saldo: number; limite: number | null } | null;
  qrPix?: (valor: number, aoPagar: () => void) => React.ReactNode;
}) {
  const [forma, setForma] = useState<string | null>(null); // forma sendo lançada
  const [valor, setValor] = useState("");
  const [bandeira, setBandeira] = useState("");
  const [obs, setObs] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const campoRef = useRef<HTMLInputElement>(null);

  const somaPagos = cent(pagos.reduce((s, p) => s + p.valor, 0));
  const falta = cent(total - somaPagos);
  const trocoTotal = cent(pagos.reduce((s, p) => s + Math.max(0, (p.recebido ?? p.valor) - p.valor), 0));

  // Abre o passo de uma forma com o que falta já preenchido.
  function abrir(f: string) {
    if (!ativo || falta <= 0.005) return;
    setForma(f);
    setValor(falta.toFixed(2).replace(".", ","));
    setBandeira("");
    setObs("");
    setAviso(null);
  }
  function fechar() {
    setForma(null);
    setValor("");
    setBandeira("");
    setObs("");
    setAviso(null);
  }

  // Foco no valor assim que o passo abre (o caixa já digita por cima).
  useEffect(() => {
    if (!forma) return;
    const t = setTimeout(() => campoRef.current?.select(), 0);
    return () => clearTimeout(t);
  }, [forma]);

  // Atalhos de teclado. Só valem fora de campos de texto, pra não atrapalhar
  // quem está digitando busca, desconto ou observação.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const alvo = e.target as HTMLElement | null;
      const digitando = !!alvo && (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.tagName === "SELECT" || alvo.isContentEditable);
      if (forma) {
        if (e.key === "Escape") { e.preventDefault(); fechar(); }
        // Bandeira por tecla, mas só com o foco no campo do valor (senão a letra
        // sumiria de dentro da observação).
        if (ehCartao(forma) && campoRef.current && document.activeElement === campoRef.current) {
          const b = BANDEIRAS.find((x) => x.tecla === e.key.toUpperCase());
          if (b) { e.preventDefault(); setBandeira(b.nome); setAviso(null); }
        }
        return;
      }
      if (digitando || e.ctrlKey || e.altKey || e.metaKey) return;
      const letra = e.key.toUpperCase();
      const f = formas.find((x) => atalhoDaForma(x) === letra);
      if (f) { e.preventDefault(); abrir(f); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forma, formas, ativo, falta]);

  // Quanto o cliente entregou (dinheiro) x quanto entra na conta.
  const entregue = num(valor);
  // Nunca lança mais do que falta; no dinheiro a diferença vira troco.
  const aplica = cent(Math.min(entregue, falta));
  const troco = forma && ehDinheiro(forma) ? Math.max(0, cent(entregue - falta)) : 0;

  const fiadoEstoura = useMemo(() => {
    if (!forma || !ehFiado(forma) || !fiado || fiado.limite == null) return null;
    const novo = cent(fiado.saldo + aplica);
    return novo > fiado.limite + 0.005 ? { novo, limite: fiado.limite, saldo: fiado.saldo } : null;
  }, [forma, fiado, aplica]);

  function salvar() {
    if (!forma) return;
    if (!(aplica > 0.005)) { setAviso("Informe o valor."); return; }
    if (ehFiado(forma) && !fiado) { setAviso("Vincule o cliente antes de usar o Saldo cliente."); return; }
    if (fiadoEstoura) {
      setAviso(`Passa do limite: ${fiado?.nome} já deve ${brl(fiadoEstoura.saldo)} e o limite é ${brl(fiadoEstoura.limite)}.`);
      return;
    }
    if (ehCartao(forma) && !bandeira) { setAviso("Escolha a bandeira."); return; }
    onAdicionar({
      uid: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      forma,
      valor: cent(aplica),
      recebido: ehDinheiro(forma) ? cent(entregue) : undefined,
      bandeira: bandeira || null,
      observacao: obs.trim() || null,
    });
    fechar();
  }

  // Clique na cédula: preenche; com Shift, soma ao que já está lá.
  function cedula(v: number, somar: boolean) {
    setValor((atual) => (somar ? cent(num(atual) + v) : v).toFixed(2).replace(".", ","));
    setAviso(null);
    campoRef.current?.focus();
  }

  const btn = "rounded-xl border px-3 py-2 text-sm font-semibold transition";
  const campo = "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

  return (
    <div className="space-y-3">
      {/* ---------- pagamentos já lançados ---------- */}
      {pagos.length > 0 && (
        <ul className="space-y-1">
          {pagos.map((p) => (
            <li key={p.uid} className="flex items-center gap-2 rounded-lg bg-zinc-50 px-2.5 py-1.5 text-sm dark:bg-zinc-900">
              <span className="min-w-0 flex-1 truncate text-zinc-700 dark:text-zinc-200">
                {p.forma}
                {p.bandeira ? <span className="text-zinc-400"> · {p.bandeira}</span> : null}
                {p.observacao ? <span className="block truncate text-[11px] text-zinc-400">{p.observacao}</span> : null}
              </span>
              <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{brl(p.valor)}</span>
              <button onClick={() => onRemover(p.uid)} title="Tirar este pagamento" className="text-zinc-400 hover:text-red-600">✕</button>
            </li>
          ))}
        </ul>
      )}

      {/* ---------- total pago / falta pagar ---------- */}
      <div className="grid grid-cols-2 gap-2 rounded-xl border border-zinc-200 p-2.5 dark:border-zinc-800">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-zinc-400">Total pago</p>
          <p className="text-xl font-black tabular-nums text-zinc-900 dark:text-zinc-50">{brl(somaPagos)}</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] uppercase tracking-wide text-zinc-400">{falta > 0.005 ? "Falta pagar" : "Fechou"}</p>
          <p className={`text-xl font-black tabular-nums ${falta > 0.005 ? "text-amber-600" : "text-emerald-600"}`}>
            {falta > 0.005 ? brl(falta) : "✓"}
          </p>
        </div>
        {trocoTotal > 0.005 && (
          <p className="col-span-2 text-right text-sm font-semibold text-emerald-600">Troco: {brl(trocoTotal)}</p>
        )}
      </div>

      {/* ---------- escolher a forma ---------- */}
      {!forma ? (
        falta > 0.005 && (
          <div>
            <p className="mb-1.5 text-[11px] uppercase tracking-wide text-zinc-400">Adicionar pagamento</p>
            <div className="grid grid-cols-2 gap-2">
              {formas.map((f) => {
                const k = atalhoDaForma(f);
                return (
                  <button
                    key={f}
                    onClick={() => abrir(f)}
                    disabled={!ativo}
                    className={`${btn} flex items-center gap-2 border-zinc-300 text-left text-zinc-700 hover:border-orange-500 hover:bg-orange-500/5 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-200`}
                  >
                    <span className="text-base">{ICONE[k] ?? "•"}</span>
                    <span className="min-w-0 flex-1 truncate">
                      <span className="rounded bg-zinc-200 px-1 text-[11px] font-bold text-zinc-600 dark:bg-zinc-700 dark:text-zinc-200">{k}</span>{" "}
                      {f}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[11px] text-zinc-400">Aperte a letra do atalho pra lançar direto.</p>
          </div>
        )
      ) : (
        /* ---------- passo da forma escolhida ---------- */
        <div className="rounded-xl border-2 border-orange-500 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-bold text-zinc-900 dark:text-zinc-50">{ICONE[atalhoDaForma(forma)] ?? "•"} {forma}</p>
            <button onClick={fechar} className="text-xs text-zinc-400 hover:text-zinc-600">Esc · voltar</button>
          </div>

          <input
            ref={campoRef}
            inputMode="decimal"
            value={valor}
            onChange={(e) => { setValor(e.target.value); setAviso(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); salvar(); } }}
            className={`${campo} text-center text-3xl font-black tabular-nums`}
          />

          <button
            onClick={() => cedula(falta, false)}
            className="mt-2 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-700 hover:border-orange-500 dark:border-zinc-700 dark:text-zinc-200"
          >
            <b>{brl(falta)}</b> <span className="text-zinc-400">(faltando)</span>
          </button>

          {ehDinheiro(forma) && (
            <>
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                {CEDULAS.map((c) => (
                  <button
                    key={c}
                    onClick={(e) => cedula(c, e.shiftKey)}
                    className="rounded-lg border border-zinc-300 py-2 text-sm font-semibold tabular-nums text-zinc-700 hover:border-orange-500 dark:border-zinc-700 dark:text-zinc-200"
                  >
                    {brl(c)}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-zinc-400">Clique para preencher. Segure Shift para somar.</p>
              {troco > 0.005 && <p className="mt-1 text-right text-sm font-bold text-emerald-600">Troco: {brl(troco)}</p>}
            </>
          )}

          {ehCartao(forma) && (
            <div className="mt-3">
              <p className="mb-1 text-[11px] uppercase tracking-wide text-zinc-400">Bandeira</p>
              <div className="flex flex-wrap gap-1.5">
                {BANDEIRAS.map((b) => (
                  <button
                    key={b.nome}
                    onClick={() => { setBandeira(b.nome); setAviso(null); }}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                      bandeira === b.nome
                        ? "bg-orange-500 text-white"
                        : "border border-zinc-300 text-zinc-600 hover:border-orange-500 dark:border-zinc-700 dark:text-zinc-300"
                    }`}
                  >
                    <span className="mr-1 opacity-60">{b.tecla}</span>{b.nome}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-zinc-400">Número da autorização e NSU vão vir sozinhos quando a maquininha for integrada.</p>
            </div>
          )}

          {ehFiado(forma) && (
            <div className="mt-3 rounded-lg bg-zinc-50 p-2 text-xs dark:bg-zinc-900">
              {fiado ? (
                <>
                  <p className="text-zinc-600 dark:text-zinc-300">
                    <b>{fiado.nome}</b> · já deve {brl(fiado.saldo)}
                    {fiado.limite != null ? ` · limite ${brl(fiado.limite)}` : " · sem limite"}
                  </p>
                  {fiado.limite != null && (
                    <p className={fiadoEstoura ? "mt-0.5 font-semibold text-red-600" : "mt-0.5 text-zinc-500"}>
                      Com esta conta ficaria {brl(cent(fiado.saldo + aplica))}
                      {fiadoEstoura ? " — passa do limite." : "."}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-amber-600">Vincule o cliente lá em cima pra usar o Saldo cliente.</p>
              )}
            </div>
          )}

          {ehPix(forma) && qrPix && aplica > 0.005 && (
            <div className="mt-3">{qrPix(cent(aplica), salvar)}</div>
          )}

          <label className="mt-3 block text-[11px] uppercase tracking-wide text-zinc-400">
            Observação
            <input
              value={obs}
              onChange={(e) => setObs(e.target.value.slice(0, 200))}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); salvar(); } }}
              placeholder="opcional"
              className={`${campo} mt-1 normal-case`}
            />
          </label>

          {aviso && <p className="mt-2 text-sm font-medium text-red-600">{aviso}</p>}

          <div className="mt-3 flex gap-2">
            <button onClick={fechar} className={`${btn} flex-1 border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300`}>
              Voltar
            </button>
            <button
              onClick={salvar}
              className={`${btn} flex-[2] border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700`}
            >
              ✓ Salvar {aplica > 0.005 ? brl(cent(aplica)) : ""}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
