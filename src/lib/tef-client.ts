"use client";

// Conversa do caixa (navegador) com o Agente TEF que roda no PRÓPRIO PC
// (http://localhost:8544). O agente fala com o gerenciador de TEF (Elgin TEF
// Hub) e com o pinpad. Sem agente no PC, o caixa segue como antes: a bandeira
// é escolhida à mão e a maquininha é usada avulsa.

export const TEF_URL = "http://localhost:8544";

export type TefStatus = {
  ok: boolean;
  versao: string;
  terminal: string;
  hostname: string;
  etapa: string;
  ocupado: boolean;
  gerenciador: boolean;
  pendente: { id: string; valor: number; nsu: string | null } | null;
};

export type TefVenda = {
  ok: boolean;
  erro?: string;
  aprovada?: boolean;
  mensagem?: string;
  idAgente?: string;
  terminal?: string;
  nsu?: string | null;
  nsuHost?: string | null;
  autorizacao?: string | null;
  rede?: string | null;
  bandeira?: string | null;
  produto?: string | null;
  tipoCartao?: string | null;
  parcelas?: string | null;
  panMascarado?: string | null;
  data?: string | null;
  hora?: string | null;
  requerConfirmacao?: boolean;
  viaCliente?: string[];
  viaLoja?: string[];
  // Só na venda/Pix: o agente achou uma transação anterior sem CNF/NCN e a
  // DESFEZ antes de começar esta. O caixa tira aquele pagamento da conta.
  desfeitaAnterior?: { id: string; nsu: string | null; valor: number } | null;
};

// Dados do TEF que viajam junto com o pagamento até o servidor.
export type TefDados = {
  idAgente: string;
  terminal: string | null;
  nsu: string | null;
  nsuHost: string | null;
  autorizacao: string | null;
  rede: string | null;
  bandeira: string | null;
  produto: string | null;
  tipo: "credito" | "debito" | "voucher";
  parcelas: number;
  panMascarado: string | null;
  viaCliente: string[];
  viaLoja: string[];
  requerConfirmacao: boolean;
  // Já confirmado (CNF) no pinpad ANTES de a venda gravar — acontece com o
  // primeiro de dois cartões na mesma conta. Não tem mais "desfazer": se a
  // venda não gravar, esse cartão só sai por cancelamento em Cartões (TEF).
  confirmado?: boolean;
};

async function chamar<T>(rota: string, body?: unknown, timeoutMs = 8000): Promise<T> {
  const r = await fetch(`${TEF_URL}${rota}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  return (await r.json()) as T;
}

// Tem agente neste PC? (responde em menos de 1 s ou não tem)
export async function tefDisponivel(): Promise<TefStatus | null> {
  try {
    const s = await chamar<TefStatus>("/status", undefined, 1200);
    return s.ok ? s : null;
  } catch {
    return null;
  }
}

// Manda o valor pro pinpad e espera o cliente passar o cartão (até 2 min).
export function tefVenda(p: { valor: number; tipo: "credito" | "debito" | "voucher"; parcelas?: number; rede?: string | null }) {
  return chamar<TefVenda>("/venda", p, 150000);
}
// Pix pelo pinpad: o gerenciador desenha o QR na tela do pinpad e só responde
// quando o cliente paga. Daí pra frente é igual à venda no cartão — inclusive a
// confirmação, que é o que evita cobrar sem a venda ter sido registrada.
//
// No dia a dia da casa o Pix principal é o do Sicoob, que não tem taxa; este
// aqui passa pela adquirente. Existe porque é item do roteiro de homologação e
// porque serve de reserva quando o Sicoob estiver fora do ar.
export function tefPix(p: { valor: number }) {
  return chamar<TefVenda>("/pix", p, 300000);
}
// `aviso` vem quando o agente não tinha nada pendente com esse id — ou já foi
// confirmado antes, ou foi desfeito (agente religado, outra venda no meio).
export function tefConfirmar(idAgente: string) {
  return chamar<{ ok: boolean; erro?: string; aviso?: string }>("/confirmar", { id: idAgente }, 20000);
}
export function tefDesfazer(idAgente: string, motivo: string) {
  return chamar<{ ok: boolean; erro?: string; aviso?: string }>("/desfazer", { id: idAgente, motivo }, 20000);
}
// Cancelamento e menu administrativo: a janela da Elgin conversa com o
// OPERADOR (data, número do documento, "confirma?", cartão de novo). O agente
// espera até 10 min; aqui um pouco mais, pra resposta dele não se perder.
export function tefCancelar(p: { nsu: string; valor: number; data: string }) {
  return chamar<TefVenda>("/cancelar", p, 630000);
}
// Menu administrativo do gerenciador (reimpressão pela Elgin, testes, etc.);
// a interação toda acontece na janela da Elgin, aqui só esperamos terminar.
export function tefAdm() {
  return chamar<TefVenda>("/adm", {}, 630000);
}

// Traduz a forma de pagamento do caixa pro tipo que o TEF entende.
export function tipoTefDaForma(forma: string): "credito" | "debito" | "voucher" | null {
  const f = forma.toLowerCase();
  if (f.includes("créd") || f.includes("cred")) return "credito";
  if (f.includes("déb") || f.includes("deb")) return "debito";
  if (f.includes("vale") || f.includes("refei") || f.includes("alimenta")) return "voucher";
  return null;
}
