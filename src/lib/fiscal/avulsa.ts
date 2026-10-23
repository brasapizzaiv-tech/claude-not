// Nota fiscal AVULSA (migration 0248): NF-e (55) pra empresa com CNPJ e NFC-e
// (65), montadas à mão na tela /salao/notas-fiscais/avulsa. Aqui só a parte
// pura — conferir os dados e montar o pedido pro Focus — pra dar pra testar
// sem emitir nada. Quem emite é a action da tela.
import type { FocusItem, FocusItemNfe, FocusNfcePayload, FocusNfePayload } from "@/lib/fiscal/focus";
import { soDigitos } from "@/lib/fiscal/cnpj";

export type ModeloNota = "nfe" | "nfce";

/** Formas de pagamento da nota (código da SEFAZ, tag tPag). */
export const FORMAS_NOTA: { cod: string; nome: string }[] = [
  { cod: "05", nome: "A prazo / faturado (crédito loja)" },
  { cod: "15", nome: "Boleto" },
  { cod: "17", nome: "Pix" },
  { cod: "01", nome: "Dinheiro" },
  { cod: "03", nome: "Cartão de crédito" },
  { cod: "04", nome: "Cartão de débito" },
  { cod: "11", nome: "Vale refeição" },
  { cod: "10", nome: "Vale alimentação" },
  { cod: "99", nome: "Outros" },
];

export type PerfilNota = {
  id: string; ncm: string | null; cest: string | null; cfop: string; csosn: string;
  origem: string; unidade: string; pis_cst: string; cofins_cst: string;
};

export type LinhaNota = {
  itemId: string | null;       // item do cardápio (pdv_itens), se veio dele
  descricao: string;
  qtd: number;
  valorUnit: number;
  perfilId: string | null;     // perfil fiscal escolhido (vale mais que o do item)
};

export type DestNota = {
  clienteId: string | null;
  doc: string;                 // CNPJ (14) ou CPF (11); na NFC-e pode ficar vazio
  nome: string;
  ie: string;                  // inscrição estadual (só números) ou ""
  indicadorIe: "1" | "2" | "9"; // 1 = tem IE, 2 = isento, 9 = não contribuinte
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
  email: string;
  telefone: string;
};

export type PadroesFiscais = { ncm: string; cfop: string; csosn: string; ufEmitente: string };

export const brl2 = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
export const totalLinhas = (ls: LinhaNota[]) => Math.round(ls.reduce((s, l) => s + l.qtd * l.valorUnit, 0) * 100) / 100;

/** O que impede a emissão (lista vazia = pode emitir). */
export function conferirNota(modelo: ModeloNota, dest: DestNota, linhas: LinhaNota[]): string[] {
  const erros: string[] = [];
  const doc = soDigitos(dest.doc);
  const validas = linhas.filter((l) => l.descricao.trim() && l.qtd > 0 && l.valorUnit > 0);
  if (validas.length === 0) erros.push("Coloque pelo menos um item com quantidade e valor.");
  if (validas.length !== linhas.length) erros.push("Tem item sem descrição, quantidade ou valor.");
  if (modelo === "nfe") {
    if (doc.length !== 14 && doc.length !== 11) erros.push("NF-e precisa do CNPJ (14 números) ou CPF (11) de quem compra.");
    if (dest.nome.trim().length < 2) erros.push("Falta o nome / razão social.");
    if (!dest.logradouro.trim()) erros.push("Falta a rua do endereço.");
    if (!dest.numero.trim()) erros.push("Falta o número do endereço (use S/N se não tiver).");
    if (!dest.bairro.trim()) erros.push("Falta o bairro.");
    if (!dest.municipio.trim()) erros.push("Falta a cidade.");
    if (!/^[A-Z]{2}$/.test(dest.uf.trim().toUpperCase())) erros.push("Falta a UF (ex.: RS).");
    if (soDigitos(dest.cep).length !== 8) erros.push("O CEP tem 8 números.");
    if (dest.indicadorIe === "1" && !soDigitos(dest.ie)) erros.push("Marcou que tem inscrição estadual: falta o número.");
  } else if (doc && doc.length !== 11 && doc.length !== 14) {
    erros.push("CPF tem 11 números e CNPJ 14.");
  }
  return erros;
}

// Data de emissão em horário de Brasília (1 min pra trás, senão a SEFAZ
// recusa como "data posterior" quando o relógio do servidor está adiantado).
export function dataEmissaoAgora(agora = Date.now()) {
  return new Date(agora - 3 * 3600 * 1000 - 60 * 1000).toISOString().slice(0, 19) + "-03:00";
}

function itemFiscal(l: LinhaNota, n: number, perfil: PerfilNota | null, pad: PadroesFiscais, interestadual: boolean): FocusItem {
  let cfop = perfil?.cfop || pad.cfop;
  // Venda pra outro estado: CFOP 5xxx vira 6xxx.
  if (interestadual && cfop.startsWith("5")) cfop = "6" + cfop.slice(1);
  const bruto = Math.round(l.qtd * l.valorUnit * 100) / 100;
  return {
    numero_item: String(n),
    codigo_produto: l.itemId ? l.itemId.slice(0, 8).toUpperCase() : `AV${n}`,
    descricao: l.descricao.split("\n")[0].trim().slice(0, 120),
    cfop,
    unidade_comercial: (perfil?.unidade || "UN").toUpperCase(),
    quantidade_comercial: l.qtd.toFixed(4),
    valor_unitario_comercial: l.valorUnit.toFixed(2),
    valor_bruto: brl2(bruto),
    codigo_ncm: soDigitos(perfil?.ncm) || pad.ncm,
    icms_origem: perfil?.origem || "0",
    icms_situacao_tributaria: perfil?.csosn || pad.csosn,
    ...(perfil?.cest ? { cest: soDigitos(perfil.cest) } : {}),
    pis_situacao_tributaria: perfil?.pis_cst || "49",
    cofins_situacao_tributaria: perfil?.cofins_cst || "49",
  };
}

export function montarNfe(args: {
  dest: DestNota; linhas: LinhaNota[]; perfilDe: (l: LinhaNota) => PerfilNota | null; pad: PadroesFiscais;
  forma: string; observacao: string; cnpjEmitente?: string; serie?: string; homologacao: boolean; agora?: number;
}): FocusNfePayload {
  const { dest, linhas, pad } = args;
  const uf = dest.uf.trim().toUpperCase();
  const interestadual = !!pad.ufEmitente && uf !== pad.ufEmitente;
  const doc = soDigitos(dest.doc);
  const items: FocusItemNfe[] = linhas.map((l, i) => {
    const it = itemFiscal(l, i + 1, args.perfilDe(l), pad, interestadual);
    return {
      ...it,
      unidade_tributavel: it.unidade_comercial,
      quantidade_tributavel: it.quantidade_comercial,
      valor_unitario_tributavel: it.valor_unitario_comercial,
      inclui_no_total: "1",
    };
  });
  const total = totalLinhas(linhas);
  const ie = soDigitos(dest.ie);
  const data = dataEmissaoAgora(args.agora);
  return {
    natureza_operacao: "Venda de mercadoria",
    data_emissao: data,
    data_entrada_saida: data,
    tipo_documento: "1",
    finalidade_emissao: "1",
    local_destino: interestadual ? "2" : "1",
    consumidor_final: "1",
    presenca_comprador: "9",
    modalidade_frete: "9",
    ...(args.cnpjEmitente ? { cnpj_emitente: soDigitos(args.cnpjEmitente) } : {}),
    ...(args.serie ? { serie: args.serie } : {}),
    // Em homologação a SEFAZ exige este texto no lugar do nome.
    nome_destinatario: args.homologacao ? "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL" : dest.nome.trim().slice(0, 60),
    ...(doc.length === 14 ? { cnpj_destinatario: doc } : { cpf_destinatario: doc }),
    indicador_inscricao_estadual_destinatario: dest.indicadorIe === "1" && ie ? "1" : dest.indicadorIe === "2" ? "2" : "9",
    ...(dest.indicadorIe === "1" && ie ? { inscricao_estadual_destinatario: ie } : {}),
    logradouro_destinatario: dest.logradouro.trim().slice(0, 60),
    numero_destinatario: dest.numero.trim().slice(0, 60) || "S/N",
    ...(dest.complemento.trim() ? { complemento_destinatario: dest.complemento.trim().slice(0, 60) } : {}),
    bairro_destinatario: dest.bairro.trim().slice(0, 60),
    municipio_destinatario: dest.municipio.trim().slice(0, 60),
    uf_destinatario: uf,
    cep_destinatario: soDigitos(dest.cep),
    ...(soDigitos(dest.telefone).length >= 10 ? { telefone_destinatario: soDigitos(dest.telefone) } : {}),
    ...(dest.email.trim() ? { email_destinatario: dest.email.trim() } : {}),
    ...(args.observacao.trim() ? { informacoes_adicionais_contribuinte: args.observacao.trim().slice(0, 2000) } : {}),
    items,
    formas_pagamento: [{ forma_pagamento: args.forma || "05", valor_pagamento: brl2(total) }],
  };
}

export function montarNfceAvulsa(args: {
  dest: DestNota; linhas: LinhaNota[]; perfilDe: (l: LinhaNota) => PerfilNota | null; pad: PadroesFiscais;
  forma: string; cnpjEmitente?: string; serie?: string; agora?: number;
}): FocusNfcePayload {
  const doc = soDigitos(args.dest.doc);
  const total = totalLinhas(args.linhas);
  return {
    natureza_operacao: "Venda ao consumidor",
    data_emissao: dataEmissaoAgora(args.agora),
    tipo_documento: "1",
    finalidade_emissao: "1",
    consumidor_final: "1",
    presenca_comprador: "1",
    modalidade_frete: "9",
    ...(args.cnpjEmitente ? { cnpj_emitente: soDigitos(args.cnpjEmitente) } : {}),
    ...(doc.length === 11 ? { cpf_destinatario: doc } : {}),
    ...(doc.length === 14 ? { cnpj_destinatario: doc } : {}),
    ...(doc && args.dest.nome.trim() ? { nome_destinatario: args.dest.nome.trim().slice(0, 60) } : {}),
    ...(args.serie ? { serie: args.serie } : {}),
    items: args.linhas.map((l, i) => itemFiscal(l, i + 1, args.perfilDe(l), args.pad, false)),
    formas_pagamento: [{ forma_pagamento: args.forma || "01", valor_pagamento: brl2(total) }],
  };
}

/** Junta os itens de várias comandas: mesmo item + mesma descrição + mesmo preço = uma linha. */
export function agruparItens(
  itens: { item_id: string | null; descricao: string | null; qtd: number; preco_unit: number }[],
  buffet: number,
): LinhaNota[] {
  const mapa = new Map<string, LinhaNota>();
  for (const it of itens) {
    const qtd = Number(it.qtd) || 0;
    const preco = Number(it.preco_unit) || 0;
    if (qtd <= 0 || preco <= 0) continue;
    const desc = (it.descricao || "Item").split("\n")[0].trim();
    const k = `${it.item_id ?? ""}|${desc.toLowerCase()}|${preco.toFixed(2)}`;
    const atual = mapa.get(k);
    if (atual) atual.qtd = Math.round((atual.qtd + qtd) * 10000) / 10000;
    else mapa.set(k, { itemId: it.item_id, descricao: desc, qtd, valorUnit: preco, perfilId: null });
  }
  const linhas = [...mapa.values()];
  if (buffet > 0) linhas.unshift({ itemId: null, descricao: "Buffet", qtd: 1, valorUnit: Math.round(buffet * 100) / 100, perfilId: null });
  return linhas;
}
