// Integração com o Focus NFe (NFC-e / NF-e). O certificado digital fica NO FOCUS
// (subido pelo usuário no painel deles) — aqui usamos SÓ o token de API.
// NFC-e é síncrona: ao emitir, já volta autorizada (ou com erro).

export type FocusAmbiente = "homologacao" | "producao";

function baseUrl(amb: FocusAmbiente) {
  return amb === "producao"
    ? "https://api.focusnfe.com.br"
    : "https://homologacao.focusnfe.com.br";
}

function authHeader(token: string) {
  // HTTP Basic: token como usuário, senha vazia.
  const b64 = Buffer.from(`${token}:`).toString("base64");
  return `Basic ${b64}`;
}

export type FocusItem = {
  numero_item: string;
  codigo_produto: string;
  descricao: string;
  cfop: string;
  unidade_comercial: string;
  quantidade_comercial: string;
  valor_unitario_comercial: string;
  valor_bruto: string;
  codigo_ncm: string;
  icms_origem: string; // "0" nacional
  icms_situacao_tributaria: string; // CSOSN (Simples), ex.: "102"
};

export type FocusPagamento = {
  forma_pagamento: string; // "01" dinheiro, "03" crédito, "04" débito, "17" Pix...
  valor_pagamento: string;
};

export type FocusNfcePayload = {
  natureza_operacao: string;
  data_emissao: string; // ISO com fuso, ex.: 2026-08-28T14:30:00-03:00
  tipo_documento: string; // "1" saída
  finalidade_emissao: string; // "1" normal
  consumidor_final: string; // "1"
  presenca_comprador: string; // "1" presencial
  modalidade_frete: string; // "9" sem frete
  cnpj_emitente?: string;
  cpf_destinatario?: string; // CPF do consumidor (opcional na NFC-e)
  items: FocusItem[];
  formas_pagamento: FocusPagamento[];
};

export type FocusResposta = {
  ok: boolean;
  status?: string; // "autorizado" | "erro_autorizacao" | "processando_autorizacao" | ...
  statusHttp: number;
  ref: string;
  numero?: string;
  serie?: string;
  chave?: string;
  caminho_danfe?: string; // caminho relativo no Focus
  caminho_xml?: string;
  urlDanfe?: string; // já com o host do Focus
  urlXml?: string;
  mensagem?: string; // mensagem de erro amigável (mensagem_sefaz)
  erros?: unknown;
  bruto?: unknown; // resposta completa (para diagnóstico)
};

type CfgFocus = { token: string; ambiente: FocusAmbiente };

function montaUrls(amb: FocusAmbiente, r: Record<string, unknown>): { urlDanfe?: string; urlXml?: string } {
  const host = baseUrl(amb);
  const cd = r.caminho_danfe as string | undefined;
  const cx = r.caminho_xml as string | undefined;
  return {
    urlDanfe: cd ? (cd.startsWith("http") ? cd : host + cd) : undefined,
    urlXml: cx ? (cx.startsWith("http") ? cx : host + cx) : undefined,
  };
}

export async function emitirNfce(
  cfg: CfgFocus,
  ref: string,
  payload: FocusNfcePayload,
): Promise<FocusResposta> {
  const url = `${baseUrl(cfg.ambiente)}/v2/nfce?ref=${encodeURIComponent(ref)}`;
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: { Authorization: authHeader(cfg.token), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    return { ok: false, statusHttp: 0, ref, mensagem: "Falha de conexão com o Focus: " + (e instanceof Error ? e.message : String(e)) };
  }
  let r: Record<string, unknown> = {};
  try { r = await resp.json(); } catch { /* corpo vazio */ }
  const status = r.status as string | undefined;
  const { urlDanfe, urlXml } = montaUrls(cfg.ambiente, r);
  const ok = resp.ok && (status === "autorizado" || status === "processando_autorizacao");
  return {
    ok,
    status,
    statusHttp: resp.status,
    ref,
    numero: r.numero as string | undefined,
    serie: r.serie as string | undefined,
    chave: (r.chave_nfe as string) || (r.chave as string) || undefined,
    caminho_danfe: r.caminho_danfe as string | undefined,
    caminho_xml: r.caminho_xml as string | undefined,
    urlDanfe,
    urlXml,
    mensagem: (r.mensagem_sefaz as string) || (r.mensagem as string) || (r.erros ? "Erro de validação — confira os dados." : undefined),
    erros: r.erros,
    bruto: r,
  };
}

export async function consultarNfce(cfg: CfgFocus, ref: string): Promise<FocusResposta> {
  const url = `${baseUrl(cfg.ambiente)}/v2/nfce/${encodeURIComponent(ref)}`;
  const resp = await fetch(url, { headers: { Authorization: authHeader(cfg.token) } });
  let r: Record<string, unknown> = {};
  try { r = await resp.json(); } catch {}
  const status = r.status as string | undefined;
  const { urlDanfe, urlXml } = montaUrls(cfg.ambiente, r);
  return {
    ok: resp.ok && status === "autorizado",
    status,
    statusHttp: resp.status,
    ref,
    numero: r.numero as string | undefined,
    chave: (r.chave_nfe as string) || undefined,
    urlDanfe,
    urlXml,
    mensagem: (r.mensagem_sefaz as string) || (r.mensagem as string) || undefined,
    bruto: r,
  };
}

export async function cancelarNfce(cfg: CfgFocus, ref: string, justificativa: string): Promise<FocusResposta> {
  const url = `${baseUrl(cfg.ambiente)}/v2/nfce/${encodeURIComponent(ref)}`;
  const resp = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: authHeader(cfg.token), "Content-Type": "application/json" },
    body: JSON.stringify({ justificativa }),
  });
  let r: Record<string, unknown> = {};
  try { r = await resp.json(); } catch {}
  const status = r.status as string | undefined;
  return {
    ok: resp.ok && (status === "cancelado" || status === "processando_cancelamento"),
    status,
    statusHttp: resp.status,
    ref,
    mensagem: (r.mensagem_sefaz as string) || (r.mensagem as string) || undefined,
    bruto: r,
  };
}
