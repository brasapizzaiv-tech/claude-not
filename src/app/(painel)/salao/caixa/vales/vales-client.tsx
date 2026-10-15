"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icone } from "@/components/icone";
import { BotaoAcao } from "@/components/enviar";
import { avisar, perguntar } from "@/components/dialogo";
import { CobrarPinpad, useAgenteTef } from "@/components/cobrar-pinpad";
import { tefDoTipo, type FormaOpcao } from "@/lib/formas-pagamento";
import { dataBR, formatarCodigo, validadePadrao, type ValeCartao } from "@/lib/vale-presente";
import { cartaoValePng, desenharCartaoVale, imprimirCartaoVale } from "@/lib/vale-cartao-imagem";
import { cancelarVale, estornarUsoVale, imprimirValeCaixa, prorrogarVale, venderValePresente } from "./actions";

export type ValeLinha = ValeCartao & {
  id: string;
  telefone: string | null;
  forma: string | null;
  status: string;
  canceladoMotivo: string | null;
  criadoEm: string;
  usos: { id: string; tipo: string; valor: number; origem: string | null; obs: string | null; criadoEm: string }[];
};

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (s: string) => Number(String(s).replace(/\./g, "").replace(",", ".")) || 0;
const hojeSP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
const campo = "w-full min-h-11 rounded-controle border border-borda-forte bg-transparent px-3 text-sm text-texto focus:border-primaria";
const btnLinha = "flex min-h-11 items-center justify-center gap-1.5 rounded-controle border border-borda-forte px-3 text-sm font-medium text-texto-suave transition hover:bg-superficie-suave";

export function ValesClient({ vales, formas, caixaAberto, buscaInicial }: { vales: ValeLinha[]; formas: FormaOpcao[]; caixaAberto: boolean; buscaInicial: string }) {
  const router = useRouter();
  const [busca, setBusca] = useState(buscaInicial);
  const [todos, setTodos] = useState(false);
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [vendendo, setVendendo] = useState(false);
  const [entrega, setEntrega] = useState<(ValeCartao & { id: string; telefone: string | null }) | null>(null);
  const hoje = hojeSP();

  const valendo = (v: ValeLinha) => v.status === "ativo" && v.saldo > 0.005 && v.validade >= hoje;
  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qc = q.toUpperCase().replace(/[^A-Z0-9]/g, "");
    return vales.filter((v) => {
      if (!todos && !q && !valendo(v)) return false;
      if (!q) return true;
      return (qc.length >= 3 && v.codigo.includes(qc)) || [v.para, v.de, v.telefone].some((x) => (x ?? "").toLowerCase().includes(q));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vales, busca, todos]);

  const emAberto = vales.filter(valendo).reduce((s, v) => s + v.saldo, 0);
  const mes = hoje.slice(0, 7);
  const vendidosMes = vales.filter((v) => v.criadoEm.slice(0, 7) === mes && v.status === "ativo");
  const usadoMes = vales.flatMap((v) => v.usos).filter((u) => u.criadoEm.slice(0, 7) === mes).reduce((s, u) => s + (u.tipo === "uso" ? u.valor : -u.valor), 0);

  return (
    <>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-cartao bg-painel-cartao p-4">
          <p className="text-xs text-texto-suave">Saldo em aberto (a casa ainda deve)</p>
          <p className="mt-1 font-numero text-2xl font-semibold tracking-apertada text-texto">{brl(emAberto)}</p>
        </div>
        <div className="rounded-cartao bg-painel-cartao p-4">
          <p className="text-xs text-texto-suave">Vendidos este mês</p>
          <p className="mt-1 font-numero text-2xl font-semibold tracking-apertada text-texto">{brl(vendidosMes.reduce((s, v) => s + v.valor, 0))}</p>
          <p className="text-xs text-texto-suave">{vendidosMes.length} vale(s)</p>
        </div>
        <div className="rounded-cartao bg-painel-cartao p-4">
          <p className="text-xs text-texto-suave">Usados este mês</p>
          <p className="mt-1 font-numero text-2xl font-semibold tracking-apertada text-texto">{brl(usadoMes)}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setVendendo(true)}
          disabled={!caixaAberto}
          className="flex min-h-11 items-center gap-1.5 rounded-controle bg-texto px-4 text-sm font-semibold text-fundo disabled:opacity-40"
        >
          <Icone nome="presente" tamanho={16} /> Vender vale-presente
        </button>
        {!caixaAberto && <span className="text-xs text-amber-700 dark:text-amber-300">Abra o caixa pra vender (o dinheiro entra no caixa do dia).</span>}
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por código, nome ou telefone" className={`${campo} ml-auto w-full sm:w-72`} />
        <label className="flex min-h-11 items-center gap-2 text-sm text-texto-suave">
          <input type="checkbox" checked={todos} onChange={(e) => setTodos(e.target.checked)} /> Mostrar usados, vencidos e cancelados
        </label>
      </div>

      <div className="mt-3 overflow-hidden rounded-cartao border border-borda bg-painel-cartao">
        {lista.length === 0 ? (
          <p className="p-6 text-center text-sm text-texto-suave">
            {busca ? "Nenhum vale com essa busca." : "Nenhum vale valendo agora. Toque em Vender vale-presente pra criar o primeiro."}
          </p>
        ) : (
          <ul className="divide-y divide-borda">
            {lista.map((v) => {
              const vencido = v.validade < hoje;
              const situacao = v.status === "cancelado" ? "Cancelado" : v.saldo <= 0.005 ? "Usado" : vencido ? "Vencido" : null;
              const aberto = abertoId === v.id;
              return (
                <li key={v.id}>
                  <button type="button" onClick={() => setAbertoId(aberto ? null : v.id)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-superficie-suave">
                    <span className="font-mono text-base font-bold tracking-wider text-texto">{formatarCodigo(v.codigo)}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-texto-suave">
                      {v.para ? `Para ${v.para}` : "Sem nome"}{v.de ? ` · de ${v.de}` : ""}
                    </span>
                    <span className="text-sm text-texto-suave">válido até {dataBR(v.validade)}</span>
                    <span className="w-40 text-right">
                      {situacao ? (
                        <span className="text-sm font-semibold text-texto-fraco">{situacao}</span>
                      ) : (
                        <span className="font-numero text-base font-semibold text-texto">{brl(v.saldo)}</span>
                      )}
                      {v.saldo < v.valor - 0.005 && <span className="block text-xs text-texto-fraco">de {brl(v.valor)}</span>}
                    </span>
                  </button>
                  {aberto && <Detalhe v={v} hoje={hoje} onEntregar={() => setEntrega(v)} />}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {vendendo && (
        <VenderVale
          formas={formas}
          onFechar={() => setVendendo(false)}
          onVendido={(v) => { setVendendo(false); setEntrega(v); router.refresh(); }}
        />
      )}
      {entrega && <EntregarVale v={entrega} onFechar={() => setEntrega(null)} />}
    </>
  );
}

function Detalhe({ v, hoje, onEntregar }: { v: ValeLinha; hoje: string; onEntregar: () => void }) {
  const router = useRouter();
  const ativo = v.status === "ativo";
  const devolvidos = new Set(v.usos.filter((u) => u.tipo === "estorno").map((u) => (u.obs ?? "").match(/^uso:([0-9a-f-]{36})/)?.[1]).filter(Boolean));

  async function prorrogar() {
    const nova = await perguntar("Nova validade (dd/mm/aaaa)", dataBR(validadePadrao(3)), { obrigatorio: true });
    if (!nova) return;
    const m = nova.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) { void avisar("Data inválida. Use dd/mm/aaaa."); return; }
    const r = await prorrogarVale(v.id, `${m[3]}-${m[2]}-${m[1]}`);
    if (!r.ok) void avisar(r.mensagem); else router.refresh();
  }
  async function cancelar() {
    const motivo = await perguntar(`Cancelar o vale ${formatarCodigo(v.codigo)}? Ele para de valer no caixa.`, "", { detalhe: "Escreva o motivo.", obrigatorio: true });
    if (!motivo) return;
    const r = await cancelarVale(v.id, motivo);
    if (!r.ok) void avisar(r.mensagem); else router.refresh();
  }
  async function devolver(usoId: string, valor: number) {
    const motivo = await perguntar(`Devolver ${brl(valor)} ao saldo do vale?`, "", { detalhe: "Use quando a baixa foi feita por engano. O movimento do caixa não muda. Escreva o motivo.", obrigatorio: true });
    if (!motivo) return;
    const r = await estornarUsoVale(usoId, motivo);
    if (!r.ok) void avisar(r.mensagem); else router.refresh();
  }

  return (
    <div className="space-y-3 bg-superficie-suave px-4 py-3 text-sm">
      <div className="grid gap-1 text-texto-suave sm:grid-cols-2">
        <p>Vendido em {quando(v.criadoEm)}{v.forma ? ` · ${v.forma}` : ""} · {brl(v.valor)}</p>
        {v.telefone && <p>WhatsApp {v.telefone}</p>}
        {v.mensagem && <p className="italic sm:col-span-2">“{v.mensagem}”</p>}
        {v.status === "cancelado" && <p className="text-red-600 sm:col-span-2">Cancelado: {v.canceladoMotivo}</p>}
        {ativo && v.validade < hoje && <p className="text-amber-700 dark:text-amber-300 sm:col-span-2">Venceu em {dataBR(v.validade)}. Prorrogue pra aceitar no caixa.</p>}
      </div>
      {v.usos.length > 0 && (
        <ul className="space-y-1">
          {v.usos.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-x-3 rounded-controle bg-painel-cartao px-3 py-1.5">
              <span className="text-texto-suave">{quando(u.criadoEm)}</span>
              <span className="flex-1 text-texto">
                {u.tipo === "uso" ? `Usado ${u.origem === "pdv" ? "no PDV" : "no caixa"}` : `Devolvido ao saldo${u.obs?.includes(" · ") ? ` (${u.obs.split(" · ").slice(1).join(" · ")})` : ""}`}
              </span>
              <span className={`font-numero font-semibold ${u.tipo === "uso" ? "text-texto" : "text-emerald-600"}`}>{u.tipo === "uso" ? "−" : "+"} {brl(u.valor)}</span>
              {u.tipo === "uso" && ativo && !devolvidos.has(u.id) && (
                <BotaoAcao aoClicar={() => devolver(u.id, u.valor)} className="text-xs text-texto-fraco underline hover:text-texto">devolver</BotaoAcao>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onEntregar} className={btnLinha}><Icone nome="presente" tamanho={15} /> Cartão, imagem e cupom</button>
        {ativo && <BotaoAcao aoClicar={prorrogar} className={btnLinha}><Icone nome="agenda" tamanho={15} /> Prorrogar validade</BotaoAcao>}
        {ativo && <BotaoAcao aoClicar={cancelar} className={`${btnLinha} text-red-600`}>Cancelar vale</BotaoAcao>}
      </div>
    </div>
  );
}

const SUGESTOES = [50, 100, 150, 200];

function VenderVale({ formas, onFechar, onVendido }: { formas: FormaOpcao[]; onFechar: () => void; onVendido: (v: ValeCartao & { id: string; telefone: string | null }) => void }) {
  const [valor, setValor] = useState("");
  const [para, setPara] = useState("");
  const [de, setDe] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [telefone, setTelefone] = useState("");
  const [validade, setValidade] = useState(() => validadePadrao());
  const [forma, setForma] = useState(formas[0]?.nome ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const agenteTef = useAgenteTef();
  const vendido = useRef<{ id: string; codigo: string } | null>(null);
  const v = Math.round(num(valor) * 100) / 100;
  const tipo = formas.find((f) => f.nome === forma)?.tipo ?? "outro";
  const tef = tefDoTipo(tipo);
  const pronto = v > 0 && !!forma;

  const dados = () => ({ valor: v, para, de, mensagem, telefone, validade, forma });
  const cartao = (r: { id: string; codigo: string }) => ({
    id: r.id, codigo: r.codigo, valor: v, saldo: v, para: para.trim() || null, de: de.trim() || null, mensagem: mensagem.trim() || null, validade, telefone: telefone.replace(/\D/g, "") || null,
  });

  async function vender() {
    setErro(null);
    const r = await venderValePresente(dados());
    if (!r.ok) { setErro(r.mensagem); return; }
    onVendido(cartao(r));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <div className="my-6 w-full max-w-lg rounded-cartao bg-painel-cartao p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-texto">Vender vale-presente</h2>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="text-texto-fraco hover:text-texto-suave">✕</button>
        </div>

        <label className="block text-xs text-texto-suave">Valor do vale</label>
        <div className="mt-1 flex flex-wrap gap-2">
          {SUGESTOES.map((s) => (
            <button key={s} type="button" onClick={() => setValor(String(s))} className={`min-h-11 rounded-controle border px-4 text-sm font-semibold ${v === s ? "border-primaria bg-primaria/10 text-texto" : "border-borda-forte text-texto-suave"}`}>
              {brl(s).replace(",00", "")}
            </button>
          ))}
          <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder="outro valor" className={`${campo} w-32 flex-1 text-base`} />
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs text-texto-suave">Para quem (sai no cartão)
            <input value={para} onChange={(e) => setPara(e.target.value.slice(0, 80))} placeholder="ex.: Ana Paula" className={`${campo} mt-1`} />
          </label>
          <label className="block text-xs text-texto-suave">De quem
            <input value={de} onChange={(e) => setDe(e.target.value.slice(0, 80))} placeholder="ex.: João" className={`${campo} mt-1`} />
          </label>
        </div>
        <label className="mt-3 block text-xs text-texto-suave">Recado (opcional)
          <input value={mensagem} onChange={(e) => setMensagem(e.target.value.slice(0, 200))} placeholder="ex.: Feliz aniversário!" className={`${campo} mt-1`} />
        </label>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs text-texto-suave">WhatsApp pra mandar (opcional)
            <input value={telefone} onChange={(e) => setTelefone(e.target.value.slice(0, 20))} inputMode="tel" placeholder="(51) 99999-9999" className={`${campo} mt-1`} />
          </label>
          <label className="block text-xs text-texto-suave">Válido até
            <input type="date" value={validade} min={hojeSP()} onChange={(e) => setValidade(e.target.value)} className={`${campo} mt-1`} />
          </label>
        </div>

        <label className="mt-3 block text-xs text-texto-suave">Como o cliente pagou</label>
        <div className="mt-1 flex flex-wrap gap-2">
          {formas.map((f) => (
            <button key={f.nome} type="button" onClick={() => setForma(f.nome)} className={`min-h-11 rounded-controle border px-3 text-sm font-semibold ${forma === f.nome ? "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-borda-forte text-texto-suave"}`}>
              {f.nome}
            </button>
          ))}
        </div>

        {erro && <p className="mt-3 text-sm font-medium text-red-600">{erro}</p>}

        <div className="mt-4">
          {tef && agenteTef ? (
            <CobrarPinpad
              tipo={tef}
              valor={v}
              agente={agenteTef}
              desabilitado={!pronto}
              aoAprovar={async (t) => {
                const r = await venderValePresente({ ...dados(), tef: t });
                if (!r.ok) return { ok: false, mensagem: r.mensagem };
                vendido.current = { id: r.id, codigo: r.codigo };
                return { ok: true, transacaoId: r.tefTransacaoId };
              }}
              aoTerminar={() => { if (vendido.current) onVendido(cartao(vendido.current)); }}
            />
          ) : (
            <BotaoAcao aoClicar={vender} disabled={!pronto} className="flex min-h-12 w-full items-center justify-center rounded-controle bg-emerald-600 px-4 text-base font-bold text-white disabled:opacity-40">
              {pronto ? `Recebi ${brl(v)} — gerar o vale` : "Informe o valor"}
            </BotaoAcao>
          )}
          <p className="mt-2 text-xs text-texto-fraco">O valor entra no caixa de hoje como venda. Quando o vale for usado, não conta de novo.</p>
        </div>
      </div>
    </div>
  );
}

function EntregarVale({ v, onFechar }: { v: ValeCartao & { id: string; telefone: string | null }; onFechar: () => void }) {
  const [img, setImg] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const podeCompartilhar = typeof navigator !== "undefined" && typeof navigator.canShare === "function";

  useEffect(() => {
    let vivo = true;
    desenharCartaoVale(v).then((cv) => { if (vivo) setImg(cv.toDataURL("image/png")); }).catch(() => {});
    return () => { vivo = false; };
  }, [v]);

  const nomeArquivo = `vale-presente-${formatarCodigo(v.codigo)}.png`;
  const texto = `Olá${v.para ? `, ${v.para}` : ""}! Aqui está o seu vale-presente da Brasa: ${brl(v.valor)}, código ${formatarCodigo(v.codigo)}, válido até ${dataBR(v.validade)}. É só mostrar o código no caixa — dá pra usar aos poucos.`;
  const zap = (v.telefone ?? "").replace(/\D/g, "");
  const zapNum = zap ? (zap.startsWith("55") ? zap : `55${zap}`) : "";
  const linkZap = `https://web.whatsapp.com/send?${zapNum ? `phone=${zapNum}&` : ""}text=${encodeURIComponent(texto)}`;

  async function baixar() {
    const b = await cartaoValePng(v);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = nomeArquivo;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  async function compartilhar() {
    const arq = new File([await cartaoValePng(v)], nomeArquivo, { type: "image/png" });
    if (navigator.canShare?.({ files: [arq] })) {
      try { await navigator.share({ files: [arq], text: texto }); } catch { /* desistiu */ }
    } else {
      await baixar();
      setAviso("Este computador não compartilha direto: a imagem foi baixada. Anexe no WhatsApp.");
    }
  }
  function cartao(papel: "a6" | "a4") {
    const w = window.open("", "_blank");
    if (!w) { setAviso("O navegador bloqueou a janela. Libere pop-ups pra este site."); return; }
    w.document.write('<p style="font-family:Arial;padding:20px">Montando o cartão…</p>');
    void imprimirCartaoVale(v, papel, w);
  }
  async function cupom() {
    const r = await imprimirValeCaixa(v.id);
    setAviso(r.ok ? "Mandei pra impressora do caixa." : r.mensagem);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4">
      <div className="my-6 w-full max-w-2xl rounded-cartao bg-painel-cartao p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-texto">Vale {formatarCodigo(v.codigo)}</h2>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="text-texto-fraco hover:text-texto-suave">✕</button>
        </div>
        <div className="overflow-hidden rounded-controle bg-[#211915]" style={{ aspectRatio: "1480 / 1050" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- imagem gerada no navegador (data URL) */}
          {img ? <img src={img} alt={`Cartão do vale ${formatarCodigo(v.codigo)}`} className="h-full w-full" /> : <div className="flex h-full items-center justify-center text-sm text-white/60">Desenhando o cartão…</div>}
        </div>

        <p className="mt-3 text-xs text-texto-suave">Como entregar pro cliente:</p>
        <div className="mt-1 grid gap-2 sm:grid-cols-2">
          <button type="button" onClick={compartilhar} className={btnLinha}><Icone nome="zap" tamanho={15} /> {podeCompartilhar ? "Compartilhar imagem" : "Baixar imagem"}</button>
          <a href={linkZap} target="_blank" rel="noopener" className={btnLinha}><Icone nome="zap" tamanho={15} /> Abrir WhatsApp {zapNum ? "do cliente" : "com o texto"}</a>
          <BotaoAcao aoClicar={cupom} className={btnLinha}><Icone nome="imprimir" tamanho={15} /> Imprimir na térmica do caixa</BotaoAcao>
          <button type="button" onClick={() => cartao("a6")} className={btnLinha}><Icone nome="presente" tamanho={15} /> Cartão pra imprimir (A6)</button>
          <button type="button" onClick={() => cartao("a4")} className={btnLinha}><Icone nome="documento" tamanho={15} /> Cartão numa folha A4 (pra recortar)</button>
          <button type="button" onClick={baixar} className={btnLinha}><Icone nome="baixar" tamanho={15} /> Só baixar a imagem</button>
        </div>
        <p className="mt-2 text-xs text-texto-fraco">No WhatsApp Web, anexe a imagem baixada na conversa (o texto já vai com o código).</p>
        {aviso && <p className="mt-2 text-sm font-medium text-texto">{aviso}</p>}
      </div>
    </div>
  );
}
