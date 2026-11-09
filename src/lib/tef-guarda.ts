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
import { avisar } from "@/components/dialogo";
import { tefConfirmar, tefDesfazer, tefDisponivel, type TefDados } from "@/lib/tef-client";
import { fecharTef, registrarRecusaTef, registrarTefAvulso } from "@/app/(painel)/salao/actions";

type TipoTef = TefDados["tipo"];
/** O que vai pro registro: o tipo pode faltar (aba fechada antes de anotar). */
export type TefParaGuardar = Omit<TefDados, "tipo"> & { tipo: TipoTef | null };

// Tudo fica no navegador deste PC (sobrevive a fechar a aba; o agente é deste
// PC também). Três anotações:
//  - a última cobrança mandada pro pinpad: se a resposta chegar sem ninguém
//    pra receber, a próxima tela sabe o que era (tipo, conta, comprovante);
//  - os que o caixa mandou DESFAZER e o agente não respondeu: esses a guarda
//    desfaz, não guarda (o caixa já disse ao cliente que voltou);
//  - os confirmados no pinpad que não conseguiram ser gravados (sem conexão):
//    a guarda tenta de novo, senão o dinheiro entra e não aparece em lugar nenhum.
const CHAVE = "tef-ultima-cobranca";
const CHAVE_DESFAZER = "tef-desfazer";
const CHAVE_REGISTRAR = "tef-registrar";
type Anotacao = { tipo: TipoTef; valor: number; conta: string; desde: number; tef?: TefDados; aprovadaEm?: number };
type ARegistrar = { tef: TefParaGuardar; valor: number; motivo: string };

function ler<T>(chave: string): T | null {
  try {
    const s = localStorage.getItem(chave);
    return s ? (JSON.parse(s) as T) : null;
  } catch {
    return null;
  }
}
function gravar(chave: string, v: unknown) {
  try {
    if (v == null || (Array.isArray(v) && v.length === 0)) localStorage.removeItem(chave);
    else localStorage.setItem(chave, JSON.stringify(v));
  } catch { /* sem armazenamento: a guarda segue só com o que o agente sabe */ }
}

/** Logo antes de mandar pro pinpad. */
/** Guarda a recusa do pinpad para a assistência. Fora da fila da venda: se falhar, o caixa nem percebe. */
export function anotarRecusa(d: Parameters<typeof registrarRecusaTef>[0]) {
  void registrarRecusaTef(d).catch(() => {});
}

export function anotarCobranca(tipo: TipoTef, valor: number, conta: string) {
  gravar(CHAVE, { tipo, valor, conta, desde: Date.now() } satisfies Anotacao);
}
/** O pinpad aprovou: guarda os dados do comprovante junto. */
export function anotarAprovada(tef: TefDados) {
  const a = ler<Anotacao>(CHAVE);
  if (a) gravar(CHAVE, { ...a, tef, aprovadaEm: Date.now() } satisfies Anotacao);
}
/** A venda gravou, ou o pagamento foi desfeito de propósito: não tem mais o que guardar. */
export function esquecerCobranca(idAgente?: string) {
  const a = ler<Anotacao>(CHAVE);
  if (!a || (idAgente && a.tef && a.tef.idAgente !== idAgente)) return;
  gravar(CHAVE, null);
}

/**
 * Desfaz no pinpad (a venda não gravou, ou o caixa tirou o pagamento). Se o
 * agente não responder, anota: a guarda desfaz depois em vez de guardar —
 * o caixa já disse ao cliente que a cobrança voltou.
 */
export async function desfazerNoPinpad(idAgente: string, motivo: string) {
  esquecerCobranca(idAgente);
  try {
    const r = await tefDesfazer(idAgente, motivo);
    if (r.ok) return;
  } catch { /* anota abaixo */ }
  const l = ler<string[]>(CHAVE_DESFAZER) ?? [];
  if (!l.includes(idAgente)) gravar(CHAVE_DESFAZER, [...l, idAgente].slice(-10));
}

const nomeDoTipo = (t: TipoTef | null) =>
  t === "pix" ? "Pix" : t === "credito" ? "crédito" : t === "debito" ? "débito" : t === "voucher" ? "vale" : "pagamento";
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

async function registrar(x: ARegistrar): Promise<boolean> {
  try {
    return (await registrarTefAvulso(x.tef, x.valor, x.motivo)).ok;
  } catch {
    return false;
  }
}
/** Tenta de novo gravar os que ficaram só no pinpad (sem conexão na hora). */
export async function reenviarGuardados() {
  const l = ler<ARegistrar[]>(CHAVE_REGISTRAR) ?? [];
  if (l.length === 0) return;
  const sobra: ARegistrar[] = [];
  for (const x of l) if (!(await registrar(x))) sobra.push(x);
  gravar(CHAVE_REGISTRAR, sobra);
}

/**
 * Confirma no pinpad (se ainda não foi) e guarda como recebido sem conta.
 * Devolve false quando o agente já não tinha esse pagamento em aberto (foi
 * desfeito, ou outra tela confirmou e guardou) ou não respondeu. Confirmado e
 * sem conexão pra gravar: fica anotado e a guarda tenta de novo depois.
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
  esquecerCobranca(tef.idAgente);
  const x: ARegistrar = { tef: { ...tef, confirmado: true }, valor, motivo };
  if (!(await registrar(x))) gravar(CHAVE_REGISTRAR, [...(ler<ARegistrar[]>(CHAVE_REGISTRAR) ?? []), x].slice(-20));
  return true;
}

// ---------- Confirmação depois da venda (DES-010, 03/11/2026) ----------
// A venda já gravou e o caixa ficava ~3,9 s parado: o agente espera 3 s por um
// eco do CNF que o gerenciador da Elgin não manda. Agora o "Recebido" aparece na
// hora e o CNF + fechamento correm aqui, em fila, fora da tela. A anotação vem
// antes de tudo: se a aba fechar no meio, a próxima tela termina, e a guarda sabe
// que aquele pagamento TEM venda (não é "recebido sem conta").
const CHAVE_FECHAR = "tef-fechar";
type AFechar = {
  idAgente: string;
  transacaoId: string | null;
  /** CNF resolvido: já estava confirmado, ou só falta gravar o fechamento. */
  confirmado: boolean;
  desde: number;
  /** O CNF saiu pelo menos uma vez. Sem isso, "nada pendente" quer dizer que o agente desfez. */
  cnfEnviado?: boolean;
  /** O CNF não chegou ao gerenciador: "nada pendente" depois disso quer dizer desfeito. */
  falhou?: boolean;
  desfeito?: boolean;
  motivo?: string;
};
let filaFechar: Promise<unknown> = Promise.resolve();
// Os que esta aba já tentou. Os outros, com menos de 30 s, são de outra aba que
// ainda está cuidando deles.
const tentados = new Set<string>();
// A página está indo embora: o navegador aborta o fetch e isso parece falha do
// agente, mas o CNF pode ter chegado. Não é "falhou".
let saindo = false;
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => { saindo = true; });
  window.addEventListener("pageshow", () => { saindo = false; });
}
function temAnotacoes() {
  try {
    localStorage.setItem("tef-teste", "1");
    localStorage.removeItem("tef-teste");
    return true;
  } catch {
    return false;
  }
}

function mudarFechar(idAgente: string, mudar: Partial<AFechar> | null) {
  const l = ler<AFechar[]>(CHAVE_FECHAR) ?? [];
  gravar(CHAVE_FECHAR, mudar ? l.map((x) => (x.idAgente === idAgente ? { ...x, ...mudar } : x)) : l.filter((x) => x.idAgente !== idAgente));
}

async function mandarCnf(idAgente: string): Promise<"ok" | "sem_pendente" | "sem_resposta" | "falhou"> {
  // Pinpad ocupado com outra operação (409): espera um pouco em vez de desistir.
  for (let i = 0; i < 8; i++) {
    try {
      const c = await tefConfirmar(idAgente);
      if (c.ok) return c.aviso ? "sem_pendente" : "ok";
      if (!/em andamento/i.test(c.erro ?? "")) return "falhou";
    } catch (e) {
      // Tempo esgotado: o agente pode ter recebido e seguir com o CNF.
      return saindo || (e instanceof DOMException && e.name === "TimeoutError") ? "sem_resposta" : "falhou";
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return "falhou";
}

/** Devolve false se o pinpad não confirmou; o pagamento segue anotado pra tentar de novo. */
async function fecharUm(x: AFechar, primeira: boolean): Promise<boolean> {
  let { confirmado, desfeito, motivo } = x;
  if (!confirmado) {
    mudarFechar(x.idAgente, { cnfEnviado: true });
    const c = await mandarCnf(x.idAgente);
    // Outra aba pode ter resolvido enquanto este CNF esperava a vez: vale o que
    // ela anotou, não o que esta aba leu antes.
    const agora = (ler<AFechar[]>(CHAVE_FECHAR) ?? []).find((a) => a.idAgente === x.idAgente);
    if (!agora && temAnotacoes()) return true;
    if (agora?.confirmado) {
      ({ confirmado, desfeito, motivo } = agora);
    } else {
      if (c === "falhou" || c === "sem_resposta") {
        mudarFechar(x.idAgente, { falhou: c === "falhou" || agora?.falhou || x.falhou });
        return false;
      }
      confirmado = true;
      if (c === "sem_pendente" && !primeira) {
        if (agora?.falhou || x.falhou || !x.cnfEnviado) {
          // O CNF não chegou, e o agente já não tem o pagamento: ele desfez ao religar.
          desfeito = true;
          // Isto é DEDUÇÃO, não algo que o agente disse: o CNF pode ter chegado e só
          // a resposta se perdeu. Por isso fica "A CONFERIR" em Cartões (TEF), com os
          // botões de quem olhou o extrato (PAG-01: R$ 48,90 da comanda 246, 05/11).
          motivo = "A CONFERIR: o CNF não chegou e o agente não tem mais esse pagamento em aberto — confira no extrato da adquirente se entrou";
          void avisar("Um pagamento do pinpad ficou A CONFERIR.", "A venda está gravada, mas não deu pra saber se o cartão foi confirmado. Confira no extrato da adquirente e marque em Cartões (TEF).");
        } else {
          motivo = "a tela saiu antes da resposta do CNF; o agente não tem mais esse pagamento em aberto";
        }
      }
      mudarFechar(x.idAgente, { confirmado, desfeito, motivo });
    }
  }
  if (x.transacaoId) {
    // Sem conexão: fica anotado e fecha na próxima (o CNF já foi).
    try { await fecharTef(x.transacaoId, !desfeito, motivo); } catch { return true; }
  }
  mudarFechar(x.idAgente, null);
  return true;
}

/**
 * A venda gravou: confirma no pinpad e fecha a transação fora da tela. Volta na
 * hora; o caixa já pode seguir. Se o pinpad não confirmar, avisa, e a próxima
 * cobrança tenta de novo antes de começar (senão o agente desfaria o pagamento).
 */
export function confirmarVendaGravada(regs: { idAgente: string; transacaoId: string | null; confirmado: boolean }[]) {
  if (regs.length === 0) return;
  const desde = Date.now();
  const novos: AFechar[] = regs.map((r) => ({ ...r, desde }));
  gravar(CHAVE_FECHAR, [...(ler<AFechar[]>(CHAVE_FECHAR) ?? []), ...novos]);
  for (const r of regs) esquecerCobranca(r.idAgente);
  filaFechar = filaFechar.then(async () => {
    let falhou = false;
    for (const x of novos) {
      tentados.add(x.idAgente);
      if (!(await fecharUm(x, true))) falhou = true;
    }
    if (falhou) void avisar("O pinpad não confirmou o último pagamento.", "A venda está gravada. Confira se o gerenciador do TEF está aberto: o sistema tenta de novo antes da próxima cobrança.");
  });
}

/** Espera os CNFs desta aba: o pinpad só faz uma operação por vez. */
export function aguardarConfirmacoes() {
  return filaFechar;
}

/** Termina o que ficou pela metade (aba fechada, sem conexão, agente fora do ar). */
async function retomarFechamentos() {
  await filaFechar;
  const faltam = (ler<AFechar[]>(CHAVE_FECHAR) ?? []).filter((x) => tentados.has(x.idAgente) || Date.now() - x.desde > 30_000);
  if (faltam.length === 0) return;
  filaFechar = filaFechar.then(async () => {
    for (const x of faltam) {
      tentados.add(x.idAgente);
      await fecharUm(x, false);
    }
  });
  await filaFechar;
}

/**
 * Antes de mandar uma cobrança nova pro pinpad (e ao abrir o Pagamento). Se
 * o agente tem um pagamento aprovado e ainda sem confirmação que NÃO é desta
 * conta (`daConta`: os que esta tela mesma vai confirmar), o agente o
 * desfaria ao receber a cobrança nova — então guarda ele antes.
 *
 * `recado`: o que mostrar ao caixa. `bloquear`: não mande a cobrança nova
 * agora (não deu pra guardar, ou outra tela ainda está gravando aquele).
 */
export async function resgatarPendente(daConta: string[] = []): Promise<{ recado: string | null; bloquear: string | null }> {
  const nada = { recado: null, bloquear: null };
  await reenviarGuardados();
  await retomarFechamentos();
  const s = await tefDisponivel();
  if (!s) return nada;
  const p = s.pendente;
  // Nada em aberto no agente: o que estava pra desfazer já foi resolvido.
  if (!p) { gravar(CHAVE_DESFAZER, null); return nada; }
  if (daConta.includes(p.id)) return nada;
  const v = brl(Number(p.valor));

  // A venda deste já gravou, só falta o CNF. Não é "sem conta", e uma cobrança
  // nova agora faria o agente desfazer um pagamento que está na venda.
  const fechando = (ler<AFechar[]>(CHAVE_FECHAR) ?? []).find((x) => x.idAgente === p.id);
  if (fechando) {
    return {
      recado: null,
      bloquear: fechando.falhou
        ? `O pinpad não confirmou o pagamento anterior de ${v}. Confira se o gerenciador do TEF está aberto e tente de novo.`
        : `O pinpad ainda está confirmando o pagamento anterior de ${v}. Espere uns segundos e tente de novo.`,
    };
  }

  // O caixa mandou desfazer e o agente não respondeu na hora: desfaz agora.
  const desfazer = ler<string[]>(CHAVE_DESFAZER) ?? [];
  if (desfazer.includes(p.id)) {
    try {
      const r = await tefDesfazer(p.id, "o caixa já tinha desfeito");
      if (r.ok) gravar(CHAVE_DESFAZER, desfazer.filter((x) => x !== p.id));
    } catch { /* se não der, o agente desfaz sozinho com a cobrança nova */ }
    return nada;
  }

  const a = ler<Anotacao>(CHAVE);
  const anot = a && Math.abs(a.valor - Number(p.valor)) < 0.005 && Date.now() - a.desde < 3_600_000 ? a : null;
  // Aprovado há poucos segundos: a tela dona (outra aba) pode estar gravando a
  // venda agora mesmo. Guardar por cima faria ela achar que desfez.
  if (anot?.tef?.idAgente === p.id && anot.aprovadaEm && Date.now() - anot.aprovadaEm < 60_000) {
    return { recado: null, bloquear: `O pinpad ainda está fechando um ${nomeDoTipo(anot.tipo)} de ${v} de outra tela. Espere uns segundos e tente de novo.` };
  }

  const tef: TefParaGuardar =
    anot?.tef?.idAgente === p.id
      ? anot.tef
      : {
          idAgente: p.id, terminal: s.terminal || null, nsu: p.nsu, nsuHost: null, autorizacao: null,
          rede: null, bandeira: null, produto: null, tipo: anot?.tipo ?? null, parcelas: 1,
          panMascarado: null, viaCliente: [], viaLoja: [], requerConfirmacao: true, confirmado: false,
        };
  const conta = anot?.conta ? ` (${anot.conta})` : "";
  const ok = await guardarSemConta(tef, Number(p.valor), `aprovado no pinpad sem ninguém na tela pra lançar${anot?.conta ? ` · ${anot.conta}` : ""}`);
  if (!ok) {
    return { recado: null, bloquear: `Tem um ${nomeDoTipo(tef.tipo)} de ${v}${conta} aprovado no pinpad que não consegui guardar. Tente de novo em instantes: se passar outra cobrança agora, ele volta pro cliente.` };
  }
  return { recado: `Tinha um ${nomeDoTipo(tef.tipo)} de ${v}${conta} aprovado no pinpad sem lançamento. Confirmei pra não voltar pro cliente: se não estiver numa venda, está em "Recebido sem conta".`, bloquear: null };
}
