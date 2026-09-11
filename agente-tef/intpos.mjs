// Protocolo de troca de arquivos do TEF (o "Gerenciador Padrão" que Elgin TEF Hub,
// PayGo e SiTef entendem). O PDV grava IntPos.001 na pasta Req; o gerenciador
// responde IntPos.Sts (recebi) e depois IntPos.001 na pasta Resp; o PDV fecha
// com CNF (confirma) ou NCN (desfaz). Texto puro, uma chave por linha:
//   000-000 = CRT
// Referência: elgindevelopercommunity.github.io (Modo Passivo → Descrição das Chaves).

export const CHAVES = {
  OPERACAO: "000-000",          // CRT venda · CNC cancelamento · CNF · NCN · ADM · ATV · PIX
  ID: "001-000",                // número de controle da automação (volta na resposta)
  DOC_FISCAL: "002-000",
  VALOR: "003-000",             // centavos
  MOEDA: "004-000",             // 0 = real
  STATUS: "009-000",
  REDE: "010-000",              // I/O: pode ser enviado pra escolher a adquirente
  COD_REDE: "010-001",
  BANDEIRA: "010-002",
  COD_TRANSACAO: "011-000",     // 10 crédito à vista · 20 débito · 11/12 parcelado
  NSU: "012-000",
  AUTORIZACAO: "013-000",
  TIPO_PARCELAMENTO: "017-000", // 0 loja · 1 emissor
  PARCELAS: "018-000",
  DATA: "022-000",              // DDMMAAAA
  HORA: "023-000",              // HHMMSS
  NSU_ORIGINAL: "025-000",
  FINALIZACAO: "027-000",       // devolvido na CNF/NCN
  N_LINHAS_CUPOM: "028-000",
  TEXTO_OPERADOR: "030-000",
  NSU_HOST: "043-000",
  COD_RESPOSTA: "047-000",
  COD_OPERACAO: "375-000",
  MSG_OPERACAO: "375-001",
  RETORNO: "375-028",           // 0 = precisa CNF/NCN · 1 = não precisa · >=2 erro
  TERMINAL: "718-000",
  REQUER_CONFIRMACAO: "729-000",// 1 = não/já confirmada · 2 = requer
  TIPO_CARTAO: "731-000",       // 0 qualquer · 1 crédito · 2 débito · 3 voucher
  PAN_MASCARADO: "740-000",
  PORTADOR: "741-000",
  PRODUTO: "742-000",
  FIM: "999-999",
};

// Monta o texto do arquivo. `pares` = [[chave, valor], ...] na ordem.
export function montar(pares) {
  const linhas = pares
    .filter(([, v]) => v !== undefined && v !== null && String(v) !== "")
    .map(([k, v]) => `${k} = ${v}`);
  linhas.push(`${CHAVES.FIM} = 0`);
  return linhas.join("\r\n") + "\r\n";
}

// Lê o texto de um arquivo INTPOS: devolve { "000-000": "CRT", ... } e as
// listas de linhas de comprovante (029-xxx via única, 713-xxx cliente, 715-xxx loja).
export function ler(texto) {
  const campos = {};
  const viaUnica = [], viaCliente = [], viaLoja = [];
  for (const linhaCrua of String(texto).split(/\r?\n/)) {
    const linha = linhaCrua.replace(/^﻿/, "");
    const m = linha.match(/^\s*(\d{3}-\d{3})\s*=\s?(.*)$/);
    if (!m) continue;
    const [, chave, valor] = m;
    if (chave.startsWith("029-")) viaUnica.push(valor);
    else if (chave.startsWith("713-")) viaCliente.push(valor);
    else if (chave.startsWith("715-")) viaLoja.push(valor);
    else campos[chave] = valor.trim();
  }
  return { campos, viaUnica, viaCliente, viaLoja };
}

// Venda: valor em REAIS, tipo "credito" | "debito" | "voucher" | "qualquer".
export function requisicaoVenda({ id, valor, tipo = "qualquer", parcelas = 1, rede, terminal, docFiscal }) {
  const centavos = Math.round(Number(valor) * 100);
  const tipoCartao = { credito: 1, debito: 2, voucher: 3 }[tipo] ?? 0;
  const pares = [
    [CHAVES.OPERACAO, "CRT"],
    [CHAVES.ID, id],
    [CHAVES.DOC_FISCAL, docFiscal],
    [CHAVES.VALOR, centavos],
    [CHAVES.MOEDA, 0],
    [CHAVES.TIPO_CARTAO, tipoCartao],
  ];
  if (tipo === "credito" && Number(parcelas) > 1) {
    pares.push([CHAVES.COD_TRANSACAO, 11], [CHAVES.TIPO_PARCELAMENTO, 0], [CHAVES.PARCELAS, parcelas]);
  }
  if (rede) pares.push([CHAVES.REDE, rede]);
  if (terminal) pares.push([CHAVES.TERMINAL, terminal]);
  return montar(pares);
}

export function requisicaoConfirmar(id, finalizacao) {
  return montar([[CHAVES.OPERACAO, "CNF"], [CHAVES.ID, id], [CHAVES.FINALIZACAO, finalizacao]]);
}
export function requisicaoDesfazer(id, finalizacao) {
  return montar([[CHAVES.OPERACAO, "NCN"], [CHAVES.ID, id], [CHAVES.FINALIZACAO, finalizacao]]);
}
export function requisicaoCancelar({ id, valor, nsu, data, terminal }) {
  return montar([
    [CHAVES.OPERACAO, "CNC"],
    [CHAVES.ID, id],
    [CHAVES.VALOR, Math.round(Number(valor) * 100)],
    [CHAVES.MOEDA, 0],
    [CHAVES.NSU_ORIGINAL, nsu],
    [CHAVES.DATA, data],
    [CHAVES.TERMINAL, terminal],
  ]);
}
export function requisicaoAdm(id, terminal) {
  return montar([[CHAVES.OPERACAO, "ADM"], [CHAVES.ID, id], [CHAVES.TERMINAL, terminal]]);
}

// Interpreta a resposta do gerenciador num objeto que o caixa entende.
export function interpretar(texto) {
  const { campos, viaUnica, viaCliente, viaLoja } = ler(texto);
  const c = campos;
  const status = (c[CHAVES.STATUS] || "").toUpperCase();
  const codOp = c[CHAVES.COD_OPERACAO];
  // Aprovada: status vazio/OK e código da operação 0 (ou ausente) — cada
  // gerenciador preenche um pouco diferente, então aceita as duas pistas.
  const aprovada = (codOp === undefined || codOp === "0" || codOp === "00") && !/NEGAD|CANCEL|ERRO|NAO|NÃO/.test(status) && !!(c[CHAVES.NSU] || c[CHAVES.AUTORIZACAO]);
  const retorno = c[CHAVES.RETORNO];
  const requerConfirmacao = c[CHAVES.REQUER_CONFIRMACAO] === "2" || retorno === "0";
  return {
    operacao: c[CHAVES.OPERACAO] || "",
    id: c[CHAVES.ID] || "",
    aprovada,
    status,
    mensagem: c[CHAVES.MSG_OPERACAO] || c[CHAVES.TEXTO_OPERADOR] || "",
    codigo: codOp ?? null,
    nsu: c[CHAVES.NSU] || null,
    nsuHost: c[CHAVES.NSU_HOST] || null,
    autorizacao: c[CHAVES.AUTORIZACAO] || null,
    rede: c[CHAVES.REDE] || null,
    bandeira: c[CHAVES.BANDEIRA] || null,
    produto: c[CHAVES.PRODUTO] || null,
    tipoCartao: c[CHAVES.TIPO_CARTAO] || null,
    parcelas: c[CHAVES.PARCELAS] || null,
    data: c[CHAVES.DATA] || null,
    hora: c[CHAVES.HORA] || null,
    valor: c[CHAVES.VALOR] ? Number(c[CHAVES.VALOR]) / 100 : null,
    panMascarado: c[CHAVES.PAN_MASCARADO] || null,
    portador: c[CHAVES.PORTADOR] || null,
    terminal: c[CHAVES.TERMINAL] || null,
    finalizacao: c[CHAVES.FINALIZACAO] || "",
    requerConfirmacao,
    viaCliente: viaCliente.length ? viaCliente : viaUnica,
    viaLoja: viaLoja.length ? viaLoja : viaUnica,
    campos: c,
  };
}
