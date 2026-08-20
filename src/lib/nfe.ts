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
  parcelas: { numero: string; vencimento: string | null; valor: number }[];
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

  // Parcelas (duplicatas) da cobrança — cada <dup> é um boleto/parcela.
  const parcelas = (cobr.match(/<dup>[\s\S]*?<\/dup>/g) || []).map((dup, i) => ({
    numero: pick(dup, "nDup") || String(i + 1),
    vencimento: pick(dup, "dVenc").slice(0, 10) || null,
    valor: Number(pick(dup, "vDup")) || 0,
  }));

  // Cada item vira o CUSTO REAL: valor dos produtos + ICMS-ST + FCP-ST + IPI +
  // frete + seguro + outros − desconto. Assim o preço/kg já sai com a ST
  // embutida (importante em carne/frango, que têm ST) e a soma bate com o total.
  const brutos = (xml.match(/<det[^>]*>[\s\S]*?<\/det>/g) || []).map((det) => {
    const prod = bloco(det, "prod");
    const vProd = Number(pick(prod, "vProd")) || 0;
    const extras =
      (Number(pick(prod, "vFrete")) || 0) +
      (Number(pick(prod, "vSeg")) || 0) +
      (Number(pick(prod, "vOutro")) || 0) -
      (Number(pick(prod, "vDesc")) || 0) +
      (Number(pick(det, "vIPI")) || 0) +
      (Number(pick(det, "vICMSST")) || 0) +
      (Number(pick(det, "vFCPST")) || 0);
    return {
      vProd,
      item: {
        cprod: pick(prod, "cProd"),
        descricao: pick(prod, "xProd"),
        ncm: pick(prod, "NCM"),
        ean: pick(prod, "cEAN"),
        unidade: pick(prod, "uCom"),
        qtd: Number(pick(prod, "qCom")) || 0,
        valor_unit: Number(pick(prod, "vUnCom")) || 0,
        valor_total: Math.round((vProd + extras) * 100) / 100,
      },
    };
  });
  const itens = brutos.map((b) => b.item);

  // Amarra a soma dos itens ao total da nota (vNF): distribui o resíduo (ex.:
  // II, ICMS desonerado, arredondamentos) proporcional ao valor dos produtos.
  const vnf = Number(pick(icmsTot, "vNF")) || 0;
  const somaProd = brutos.reduce((s, b) => s + b.vProd, 0);
  const somaLanded = itens.reduce((s, i) => s + i.valor_total, 0);
  if (vnf > 0 && somaProd > 0 && Math.abs(vnf - somaLanded) > 0.01) {
    const resid = vnf - somaLanded;
    let acum = 0;
    itens.forEach((i, idx) => {
      const ultima = idx === itens.length - 1;
      const extra = ultima
        ? Math.round((resid - acum) * 100) / 100
        : Math.round(resid * (brutos[idx].vProd / somaProd) * 100) / 100;
      acum += extra;
      i.valor_total = Math.round((i.valor_total + extra) * 100) / 100;
    });
  }
  for (const i of itens) {
    if (i.qtd > 0) i.valor_unit = Math.round((i.valor_total / i.qtd) * 1e6) / 1e6;
  }

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
    vencimento:
      parcelas[0]?.vencimento ??
      ((cobr.match(/<dVenc>([\s\S]*?)<\/dVenc>/) || [])[1] || null),
    parcelas,
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
