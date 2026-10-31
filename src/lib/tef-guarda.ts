"use client";

// Guarda dos pagamentos do pinpad (BUG-001, 31/10/2026).
//
// Antes, um Pix ou cartão aprovado na maquininha só era gravado pela tela que
// estava esperando a resposta. Se o caixa saía da conta no meio, o pagamento
// ficava pendente no agente e era DESFEITO na venda seguinte: o cliente pagava
// e recebia de volta (comanda 238, Pix de R$ 29,37). Agora pagamento aprovado
// não some: quem não tem mais onde pôr confirma no pinpad e guarda como
// "recebido sem conta" (registrarTefAvulso), e o caixa usa depois numa conta
// pelo Pagamento → "Recebido sem conta".
import { tefConfirmar, tefDisponivel, type TefDados } from "@/lib/tef-client";
import { registrarTefAvulso } from "@/app/(painel)/salao/actions";

type TipoTef = TefDados["tipo"];
/** O que vai pro registro: o tipo pode faltar (aba fechada antes de anotar). */
export type TefParaGuardar = Omit<TefDados, "tipo"> & { tipo: TipoTef | null };

// A última cobrança mandada pro pinpad neste PC. Fica no navegador (sobrevive
// a fechar a aba): se a resposta chegar sem ninguém pra receber, a próxima
// tela que usar o pinpad sabe o que era — tipo, conta e, se já voltou, os
// dados do comprovante. O agente só guarda id, valor e NSU.
const CHAVE = "tef-ultima-cobranca";
type Anotacao = { tipo: TipoTef; valor: number; conta: string; desde: number; tef?: TefDados };

function ler(): Anotacao | null {
  try {
    const s = localStorage.getItem(CHAVE);
    return s ? (JSON.parse(s) as Anotacao) : null;
  } catch {
    return null;
  }
}
function gravar(a: Anotacao | null) {
  try {
    if (a) localStorage.setItem(CHAVE, JSON.stringify(a));
    else localStorage.removeItem(CHAVE);
  } catch { /* sem armazenamento: a guarda segue só com o que o agente sabe */ }
}

/** Logo antes de mandar pro pinpad. */
export function anotarCobranca(tipo: TipoTef, valor: number, conta: string) {
  gravar({ tipo, valor, conta, desde: Date.now() });
}
/** O pinpad aprovou: guarda os dados do comprovante junto. */
export function anotarAprovada(tef: TefDados) {
  const a = ler();
  if (a) gravar({ ...a, tef });
}
/** A venda gravou, ou o pagamento foi desfeito de propósito: não tem mais o que guardar. */
export function esquecerCobranca(idAgente?: string) {
  const a = ler();
  if (!a || (idAgente && a.tef && a.tef.idAgente !== idAgente)) return;
  gravar(null);
}

const nomeDoTipo = (t: TipoTef | null) =>
  t === "pix" ? "Pix" : t === "credito" ? "crédito" : t === "debito" ? "débito" : t === "voucher" ? "vale" : "pagamento";

/**
 * Confirma no pinpad (se ainda não foi) e guarda como recebido sem conta.
 * Devolve false quando o agente já não tinha esse pagamento em aberto (foi
 * desfeito, ou outra tela confirmou e guardou) ou quando não deu pra gravar.
 */
export async function guardarSemConta(tef: TefParaGuardar, valor: number, motivo: string): Promise<boolean> {
  if (!tef.confirmado) {
    try {
      const c = await tefConfirmar(tef.idAgente);
      if (!c.ok || c.aviso) return false;
    } catch {
      return false;
    }
  }
  try {
    const r = await registrarTefAvulso(tef, valor, motivo);
    if (r.ok) esquecerCobranca(tef.idAgente);
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * Antes de mandar uma cobrança nova pro pinpad. Se o agente tem um pagamento
 * aprovado e ainda sem confirmação que NÃO é desta conta (`daConta`: os que
 * esta tela mesma vai confirmar), o agente o desfaria ao receber a cobrança
 * nova — então guarda ele antes. Devolve o texto pra mostrar ao caixa.
 */
export async function resgatarPendente(daConta: string[] = []): Promise<string | null> {
  const s = await tefDisponivel();
  const p = s?.pendente;
  if (!s || !p || daConta.includes(p.id)) return null;
  const a = ler();
  const anot = a && Math.abs(a.valor - Number(p.valor)) < 0.005 && Date.now() - a.desde < 3_600_000 ? a : null;
  const tef: TefParaGuardar =
    anot?.tef?.idAgente === p.id
      ? anot.tef
      : {
          idAgente: p.id, terminal: s.terminal || null, nsu: p.nsu, nsuHost: null, autorizacao: null,
          rede: null, bandeira: null, produto: null, tipo: anot?.tipo ?? null, parcelas: 1,
          panMascarado: null, viaCliente: [], viaLoja: [], requerConfirmacao: true, confirmado: false,
        };
  const conta = anot?.conta ? ` · ${anot.conta}` : "";
  const ok = await guardarSemConta(tef, Number(p.valor), `aprovado no pinpad sem ninguém na tela pra lançar${conta}`);
  if (!ok) return null;
  const v = Number(p.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return `Tinha um ${nomeDoTipo(tef.tipo)} de ${v} aprovado no pinpad e sem lançamento${conta}. Ficou guardado em "Recebido sem conta".`;
}
