// Lê a página pública da NFC-e (o endereço do QR code do cupom) e monta a nota
// no mesmo formato da NF-e lida do XML (NfeLida), pra entrar em Notas Fiscais
// como qualquer outra. Arquivo sem dependências, testado em
// scripts/nfce-consulta.test.mjs com uma página real (Kern, 07/11/2026).
//
// A página da SVRS (RS e os estados que usam o portal dela) traz: emitente,
// itens (nome, código, qtd, unidade, unitário, total), totais, desconto, forma
// de pagamento, número, série, emissão e a chave.

export type ItemCupom = {
  cprod: string;
  descricao: string;
  ncm: string;
  ean: string;
  unidade: string;
  qtd: number;
  valor_unit: number;
  valor_total: number;
};

export type CupomLido = {
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
  itens: ItemCupom[];
  // Só do cupom (não vão pra tabela da nota):
  desconto: number;
  pagamentos: { forma: string; valor: number }[];
};

const tirarTags = (s: string) =>
  s.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
const soDig = (s: string) => (s || "").replace(/\D/g, "");
// "1.234,56" → 1234.56
const numBR = (s: string) => {
  const t = (s || "").replace(/[^\d,.-]/g, "");
  if (!t) return 0;
  const n = Number(t.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const r2 = (n: number) => Math.round(n * 100) / 100;

function entre(html: string, re: RegExp): string {
  const m = html.match(re);
  return m ? m[1] : "";
}

/** Chave de 44 dígitos do endereço do QR (p=CHAVE|2|1|1|hash) ou de um texto. */
export function chaveDoTexto(texto: string): string {
  const p = (texto || "").match(/[?&]p=(\d{44})/);
  if (p) return p[1];
  const d = soDig(texto);
  return d.length === 44 ? d : "";
}

/**
 * O parâmetro "p" do QR (chave de 44 dígitos + versão + ambiente + ... + hash),
 * tirado do endereço lido pela câmera, colado, ou "digitado" pelo leitor de QR
 * do caixa. O leitor USB funciona como teclado: num teclado ABNT o "|" (e até o
 * "?" e o "=") pode sair trocado. Então acha a chave em qualquer lugar e, depois
 * dela, qualquer separador vira "|".
 */
export function parametroDoQr(texto: string): string | null {
  let t = (texto || "").trim();
  try { t = decodeURIComponent(t); } catch { /* fica como veio */ }
  const k = t.match(/(?:^|[^0-9])(\d{44})[^0-9A-Za-z]+([0-9A-Za-z][\s\S]*)$/);
  if (!k) return null;
  const resto = k[2].split(/[^0-9A-Za-z]+/).filter(Boolean);
  if (resto.length < 2 || resto.join("").length > 200) return null;
  return `${k[1]}|${resto.join("|")}`;
}

export function lerPaginaNfce(html: string): CupomLido {
  const h = html.replace(/\r?\n/g, " ");

  // Emitente
  const emit_nome = tirarTags(entre(h, /<div[^>]*class="txtTopo"[^>]*>([\s\S]*?)<\/div>/));
  const emit_cnpj = soDig(entre(h, /CNPJ:\s*([\d./-]+)/));

  // Itens: cada <tr id="Item + N">
  const itens: ItemCupom[] = [];
  const linhas = h.match(/<tr[^>]*id="Item[^"]*"[^>]*>[\s\S]*?<\/tr>/g) || [];
  for (const tr of linhas) {
    const descricao = tirarTags(entre(tr, /<span class="txtTit[^"]*">([\s\S]*?)<\/span>/));
    const cprod = tirarTags(entre(tr, /Código:\s*([^)<]*)\)/));
    const qtd = numBR(tirarTags(entre(tr, /<span class="Rqtd">([\s\S]*?)<\/span>/)).replace(/Qtde\.:/i, ""));
    const unidade = tirarTags(entre(tr, /<span class="RUN">([\s\S]*?)<\/span>/)).replace(/^UN:\s*/i, "");
    const unit = numBR(tirarTags(entre(tr, /<span class="RvlUnit">([\s\S]*?)<\/span>/)).replace(/Vl\. Unit\.:/i, ""));
    const total = numBR(tirarTags(entre(tr, /<span class="valor">([\s\S]*?)<\/span>/)));
    if (!descricao) continue;
    itens.push({
      cprod,
      descricao,
      ncm: "",
      ean: "",
      unidade,
      qtd,
      valor_unit: unit,
      valor_total: total || r2(qtd * unit),
    });
  }

  // Totais (<div id="linhaTotal"><label>…</label><span class="totalNumb">…</span>)
  const totais: { rotulo: string; valor: number }[] = [];
  for (const m of h.matchAll(/<label[^>]*>([\s\S]*?)<\/label>\s*<span class="totalNumb[^"]*">([\s\S]*?)<\/span>/g)) {
    totais.push({ rotulo: tirarTags(m[1]), valor: numBR(tirarTags(m[2])) });
  }
  const achar = (re: RegExp) => totais.find((t) => re.test(t.rotulo))?.valor ?? 0;
  const valorTotal = achar(/^Valor total/i);
  const desconto = achar(/^Descontos?/i);
  const aPagar = achar(/^Valor a pagar/i) || r2(valorTotal - desconto);

  // Formas de pagamento: as linhas depois de "Forma de pagamento" até o "Troco"
  // ou os tributos.
  const pagamentos: { forma: string; valor: number }[] = [];
  let dentro = false;
  for (const t of totais) {
    if (/^Forma de pagamento/i.test(t.rotulo)) { dentro = true; continue; }
    if (!dentro) continue;
    if (/Tributos|^Troco/i.test(t.rotulo)) break;
    if (t.rotulo && t.valor > 0) pagamentos.push({ forma: t.rotulo, valor: t.valor });
  }

  // Número, série, emissão, chave
  const numero = soDig(entre(h, /Número:\s*<\/strong>\s*([\d.]+)/));
  const serie = soDig(entre(h, /Série:\s*<\/strong>\s*(\d+)/));
  const emissao = entre(h, /Emissão:\s*<\/strong>\s*(\d{2}\/\d{2}\/\d{4})/);
  const data_emissao = emissao ? emissao.split("/").reverse().join("-") : null;
  const chave = soDig(entre(h, /<span class="chave">([\s\S]*?)<\/span>/));

  // Desconto do cupom repartido nos itens pelo valor de cada um (o custo de
  // verdade de cada coisa), com o resto no último — igual à NF-e do XML.
  const soma = r2(itens.reduce((s, i) => s + i.valor_total, 0));
  if (soma > 0 && aPagar > 0 && Math.abs(soma - aPagar) > 0.009) {
    const resid = r2(aPagar - soma);
    let acum = 0;
    itens.forEach((i, idx) => {
      const extra = idx === itens.length - 1 ? r2(resid - acum) : r2((resid * i.valor_total) / soma);
      acum = r2(acum + extra);
      i.valor_total = r2(i.valor_total + extra);
    });
  }
  for (const i of itens) if (i.qtd > 0) i.valor_unit = Math.round((i.valor_total / i.qtd) * 1e6) / 1e6;

  return {
    chave,
    numero,
    serie,
    modelo: "65",
    data_emissao,
    emit_cnpj,
    emit_nome,
    dest_cnpj: "",
    valor: aPagar,
    vencimento: null,
    parcelas: [],
    itens,
    desconto,
    pagamentos,
  };
}
