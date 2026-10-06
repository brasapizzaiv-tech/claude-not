// Formas de pagamento da venda: o que cada TIPO decide (troco, TEF, código
// fiscal da NFC-e, ícone, tecla de atalho). Funções puras — servem no servidor
// e no navegador. A lista em si mora na tabela formas_pagamento (ver
// formas-pagamento-server.ts); "saldo" e "equipe" são fluxos fixos do caixa.
import type { NomeIcone } from "@/components/icone";

export type TipoForma = "dinheiro" | "pix" | "credito" | "debito" | "cartao" | "vale" | "outro" | "saldo" | "equipe";
/** Tipos que o dono escolhe na tela de cadastro (os fixos ficam de fora). */
export type TipoFormaCadastro = Exclude<TipoForma, "saldo" | "equipe">;

/** O que as telas de venda recebem: o nome gravado no pagamento e o tipo. */
export type FormaOpcao = {
  nome: string;
  tipo: TipoForma;
  /** Texto mostrado quando difere do nome (app do cliente: "Pix na entrega"). */
  label?: string;
};

export type FormaPagamento = {
  id: string;
  nome: string;
  tipo: TipoFormaCadastro;
  nome_app: string | null;
  no_caixa: boolean;
  no_pdv: boolean;
  no_delivery: boolean;
  no_app: boolean;
  no_fiado: boolean;
  ativo: boolean;
  ordem: number;
};

export const TIPOS_FORMA: { id: TipoFormaCadastro; label: string; explica: string }[] = [
  { id: "dinheiro", label: "Dinheiro", explica: "pede o valor recebido e calcula o troco" },
  { id: "pix", label: "Pix", explica: "mostra o QR quando o Pix online está ligado; nota automática" },
  { id: "credito", label: "Cartão de crédito", explica: "passa no pinpad (TEF) como crédito, com parcelas; nota automática" },
  { id: "debito", label: "Cartão de débito", explica: "passa no pinpad (TEF) como débito; nota automática" },
  { id: "cartao", label: "Cartão (sem dizer qual)", explica: "não passa no pinpad; pede a bandeira à mão; nota automática" },
  { id: "vale", label: "Vale refeição / alimentação", explica: "passa no pinpad como voucher; nota automática" },
  { id: "outro", label: "Outro", explica: "só registra; não dá troco, não passa no pinpad, sem nota automática" },
];

export const CANAIS: { campo: "no_caixa" | "no_pdv" | "no_delivery" | "no_app" | "no_fiado"; label: string }[] = [
  { campo: "no_caixa", label: "Caixa" },
  { campo: "no_pdv", label: "PDV" },
  { campo: "no_delivery", label: "Delivery" },
  { campo: "no_app", label: "App do cliente" },
  { campo: "no_fiado", label: "Fiado" },
];

// Pelo nome, quando a forma não está no cadastro (pagamento antigo, forma
// fixa do código). É a regra que valia antes do cadastro existir.
export function tipoPeloNome(nome: string | null | undefined): TipoForma {
  const f = (nome ?? "").toLowerCase();
  if (!f) return "outro";
  if (f.includes("dinheiro")) return "dinheiro";
  if (f.includes("pix")) return "pix";
  if (f.includes("créd") || f.includes("cred")) return "credito";
  if (f.includes("déb") || f.includes("deb")) return "debito";
  if (f.includes("vale") || f.includes("refei") || f.includes("alimenta")) return "vale";
  if (f.includes("saldo") || f.includes("fiado")) return "saldo";
  if (f.includes("equipe") || f.includes("funcion")) return "equipe";
  if (f.includes("cart")) return "cartao";
  return "outro";
}

/** Tipo de uma forma pelo cadastro; cai no nome se ela não estiver lá. */
export function tipoDe(nome: string | null | undefined, formas?: FormaOpcao[]): TipoForma {
  if (!nome) return "outro";
  const n = nome.trim().toLowerCase();
  const achada = formas?.find((f) => f.nome.trim().toLowerCase() === n);
  return achada ? achada.tipo : tipoPeloNome(nome);
}

export const daTroco = (tipo: TipoForma) => tipo === "dinheiro";
export const ehCartaoTipo = (tipo: TipoForma) => tipo === "credito" || tipo === "debito" || tipo === "cartao";

/** O que o pinpad (TEF) precisa saber; null = não passa no pinpad. */
export function tefDoTipo(tipo: TipoForma): "credito" | "debito" | "voucher" | null {
  if (tipo === "credito") return "credito";
  if (tipo === "debito") return "debito";
  if (tipo === "vale") return "voucher";
  return null;
}

/** Pix, cartão e vale entram na fila da nota automática; dinheiro é manual. */
export function emiteNotaAuto(tipo: TipoForma): boolean {
  return tipo === "pix" || tipo === "credito" || tipo === "debito" || tipo === "cartao" || tipo === "vale";
}

/** Código tPag da NFC-e (Focus/SEFAZ) por tipo. */
export function codigoFiscalDoTipo(tipo: TipoForma): string {
  switch (tipo) {
    case "dinheiro": return "01";
    case "pix": return "17";
    case "credito": return "03";
    case "debito": return "04";
    case "cartao": return "03"; // sem saber qual, vai como crédito (era "dinheiro" antes)
    case "vale": return "11"; // vale-refeição
    case "saldo": return "05"; // crédito loja (fiado)
    case "equipe": return "05";
    default: return "99"; // outros
  }
}

export function iconeDoTipo(tipo: TipoForma): NomeIcone {
  switch (tipo) {
    case "dinheiro": return "dinheiro";
    case "pix": return "rapido";
    case "credito":
    case "debito":
    case "cartao": return "cartao";
    case "vale": return "cupom";
    case "saldo": return "salao";
    case "equipe": return "cracha";
    default: return "moedas";
  }
}

/** Tecla de atalho no caixa; null = usa a primeira letra do nome. */
export function atalhoDoTipo(tipo: TipoForma): string | null {
  switch (tipo) {
    case "dinheiro": return "A";
    case "pix": return "P";
    case "credito": return "C";
    case "debito": return "B";
    case "cartao": return "T";
    case "vale": return "R";
    case "saldo": return "F";
    case "equipe": return "E";
    default: return null;
  }
}

/** Rótulo mostrado: o label (app) ou o nome. */
export const rotuloDa = (f: FormaOpcao) => f.label ?? f.nome;

// O que valia fixo no código até 06/10/2026 — só entra se a empresa ainda não
// tem nada cadastrado (empresa nova), pra tela não ficar sem botão.
export const FORMAS_PADRAO: Record<"caixa" | "pdv" | "delivery" | "app" | "fiado", FormaOpcao[]> = {
  caixa: [
    { nome: "Dinheiro", tipo: "dinheiro" },
    { nome: "Pix", tipo: "pix" },
    { nome: "Cartão de crédito", tipo: "credito" },
    { nome: "Cartão de débito", tipo: "debito" },
    { nome: "Vale refeição", tipo: "vale" },
  ],
  pdv: [
    { nome: "Dinheiro", tipo: "dinheiro" },
    { nome: "Cartão", tipo: "cartao" },
    { nome: "Pix", tipo: "pix" },
  ],
  delivery: [
    { nome: "Dinheiro", tipo: "dinheiro" },
    { nome: "Pix", tipo: "pix" },
    { nome: "Cartão de crédito", tipo: "credito" },
    { nome: "Cartão de débito", tipo: "debito" },
  ],
  app: [
    { nome: "Dinheiro", tipo: "dinheiro" },
    { nome: "Pix", tipo: "pix", label: "Pix na entrega" },
    { nome: "Cartão", tipo: "cartao", label: "Cartão na entrega" },
  ],
  fiado: [
    { nome: "Dinheiro", tipo: "dinheiro" },
    { nome: "Pix", tipo: "pix" },
    { nome: "Cartão de débito", tipo: "debito" },
    { nome: "Cartão de crédito", tipo: "credito" },
  ],
};

/** Os dois fluxos fixos (caixa, PDV e delivery), sempre depois das cadastradas. */
export const FORMAS_FIXAS_VENDA: FormaOpcao[] = [
  { nome: "Saldo cliente", tipo: "saldo" },
  { nome: "Compra da equipe", tipo: "equipe" },
];
