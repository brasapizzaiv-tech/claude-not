// Leitores de NF-e (XML) — usados tanto no upload manual quanto no SEFAZ.

const pick = (x: string, t: string) => {
  const m = x.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`));
  return m ? m[1].trim() : "";
};
const bloco = (x: string, t: string) => {
  const m = x.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`));
  return m ? m[1] : "";
};
export const soDigitos = (s: string) => (s || "").replace(/\D/g, "");

export type NfeLida = {
  chave: string;
  numero: string;
  serie: string;
  modelo: string;
  data_emissao: string | null;
  emit_cnpj: string;
  emit_nome: string;
  dest_cnpj: string;
  valor: number;
  vencimento: string | null;
  itens: {
    cprod: string;
    descricao: string;
    ncm: string;
    ean: string;
    unidade: string;
    qtd: number;
    valor_unit: number;
    valor_total: number;
  }[];
};

// NF-e completa (nfeProc / procNFe).
export function lerNfe(xml: string): NfeLida {
  const emit = bloco(xml, "emit");
  const dest = bloco(xml, "dest");
  const ide = bloco(xml, "ide");
  const icmsTot = bloco(xml, "ICMSTot");
  const cobr = bloco(xml, "cobr");

  const itens = (xml.match(/<det[^>]*>[\s\S]*?<\/det>/g) || []).map((det) => {
    const prod = bloco(det, "prod");
    return {
      cprod: pick(prod, "cProd"),
      descricao: pick(prod, "xProd"),
      ncm: pick(prod, "NCM"),
      ean: pick(prod, "cEAN"),
      unidade: pick(prod, "uCom"),
      qtd: Number(pick(prod, "qCom")) || 0,
      valor_unit: Number(pick(prod, "vUnCom")) || 0,
      valor_total: Number(pick(prod, "vProd")) || 0,
    };
  });

  return {
    chave: (xml.match(/Id="NFe(\d{44})"/) || [])[1] ?? "",
    numero: pick(ide, "nNF"),
    serie: pick(ide, "serie"),
    modelo: pick(ide, "mod"),
    data_emissao: pick(ide, "dhEmi").slice(0, 10) || null,
    emit_cnpj: soDigitos(pick(emit, "CNPJ")),
    emit_nome: pick(emit, "xNome"),
    dest_cnpj: soDigitos(pick(dest, "CNPJ")),
    valor: Number(pick(icmsTot, "vNF")) || 0,
    vencimento: (cobr.match(/<dVenc>([\s\S]*?)<\/dVenc>/) || [])[1] ?? null,
    itens,
  };
}

export type ResumoLido = {
  chave: string;
  emit_cnpj: string;
  emit_nome: string;
  valor: number;
  data_emissao: string | null;
};

// Resumo da NF-e (resNFe) — vem do SEFAZ antes da manifestação.
export function lerResumo(xml: string): ResumoLido {
  return {
    chave: pick(xml, "chNFe"),
    emit_cnpj: soDigitos(pick(xml, "CNPJ")),
    emit_nome: pick(xml, "xNome"),
    valor: Number(pick(xml, "vNF")) || 0,
    data_emissao: pick(xml, "dhEmi").slice(0, 10) || null,
  };
}
