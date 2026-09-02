// Pix via API Pix do SICREDI (padrão BACEN; conforme "Guia Técnico Integração
// API Pix Sicredi v2.1"). Roda só no servidor.
//
// Variáveis de ambiente (Vercel):
//   PIX_SICREDI_CLIENT_ID / PIX_SICREDI_CLIENT_SECRET — credenciais geradas NO
//       PORTAL a partir do CERTIFICADO VALIDADO (Certificados e Credenciais →
//       Gerar Credenciais). Credencial de app OAuth genérica não serve.
//       Homologação: credenciais vêm pelo Internet Banking (Acesso à API Pix).
//   PIX_SICREDI_CHAVE       — a chave Pix da conta da Brasa (CNPJ/e-mail/aleatória)
//   PIX_SICREDI_AMBIENTE    — "sandbox" (padrão, api-pix-h) ou "producao"
//   PIX_SICREDI_CERT_B64 / PIX_SICREDI_KEY_B64 — certificado validado (.CER em
//       PEM) e chave privada SEM SENHA (.KEY), em BASE64. mTLS é exigido nos
//       DOIS ambientes. PIX_SICREDI_CA_B64 (opcional) — cadeia completa Sicredi.
//   PIX_SICREDI_ESCOPOS     — padrão "cob.read cob.write" (tem que bater com o
//       que a cooperativa liberou; pedir escopo não liberado dá 400)
//   PIX_SICREDI_COB_VERSAO  — "v3" (padrão do Sicredi) ou "v2"
//   PIX_SICREDI_URL_API / PIX_SICREDI_URL_TOKEN — só se precisar sobrescrever
import { Agent, fetch as ufetch } from "undici";

const AMBIENTE = process.env.PIX_SICREDI_AMBIENTE === "producao" ? "producao" : "sandbox";
const URL_API =
  process.env.PIX_SICREDI_URL_API ||
  (AMBIENTE === "producao" ? "https://api-pix.sicredi.com.br" : "https://api-pix-h.sicredi.com.br");
const URL_TOKEN = process.env.PIX_SICREDI_URL_TOKEN || `${URL_API}/oauth/token`;
const CLIENT_ID = process.env.PIX_SICREDI_CLIENT_ID || "";
const CLIENT_SECRET = process.env.PIX_SICREDI_CLIENT_SECRET || "";
const CHAVE_PIX = process.env.PIX_SICREDI_CHAVE || "";
const ESCOPOS = (process.env.PIX_SICREDI_ESCOPOS || "cob.read cob.write").trim();
const COB_VERSAO = process.env.PIX_SICREDI_COB_VERSAO === "v2" ? "v2" : "v3";

export function pixConfigurado() {
  return !!(CLIENT_ID && CLIENT_SECRET && CHAVE_PIX);
}

// mTLS (certificado validado pelo Sicredi + chave privada) — exigido em
// homologação e produção. Sem cert/key a API responde 403.
let dispatcher: Agent | undefined;
function getDispatcher() {
  if (dispatcher) return dispatcher;
  const b64 = (v?: string) => (v ? Buffer.from(v, "base64").toString("utf8") : undefined);
  const cert = b64(process.env.PIX_SICREDI_CERT_B64);
  const key = b64(process.env.PIX_SICREDI_KEY_B64);
  const ca = b64(process.env.PIX_SICREDI_CA_B64);
  dispatcher = new Agent({ connect: { ...(cert && key ? { cert, key } : {}), ...(ca ? { ca } : {}) } });
  return dispatcher;
}

// Token OAuth (client_credentials) com cache até quase expirar (o Sicredi expira
// em 300 s e pode bloquear o IP por excesso de pedidos de token).
let tokenCache: { token: string; expira: number } | null = null;
async function obterToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expira) return tokenCache.token;
  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
  const form = new URLSearchParams({ grant_type: "client_credentials", scope: ESCOPOS });
  const r = await ufetch(`${URL_TOKEN}?grant_type=client_credentials`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
    dispatcher: getDispatcher(),
  });
  if (!r.ok) throw new Error(`token HTTP ${r.status}: ${(await r.text().catch(() => "")).slice(0, 200)}`);
  const j = (await r.json()) as { access_token: string; expires_in?: number };
  tokenCache = { token: j.access_token, expira: Date.now() + (Number(j.expires_in ?? 300) - 30) * 1000 };
  return j.access_token;
}

// ---------- BR Code (copia-e-cola) — payload dinâmico padrão BACEN ----------
function emv(id: string, valor: string) {
  return id + String(valor.length).padStart(2, "0") + valor;
}
function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}
// Monta o "Pix copia e cola" a partir do location devolvido pela API.
export function montarBrCode(location: string, nomeRecebedor: string, cidade: string): string {
  const nome = nomeRecebedor.normalize("NFD").replace(/[̀-ͯ]/g, "").slice(0, 25) || "RECEBEDOR";
  const cid = cidade.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().slice(0, 15) || "BRASIL";
  const gui = emv("00", "br.gov.bcb.pix") + emv("25", location.replace(/^https?:\/\//, ""));
  let p =
    emv("00", "01") +
    emv("26", gui) +
    emv("52", "0000") +
    emv("53", "986") +
    emv("58", "BR") +
    emv("59", nome) +
    emv("60", cid) +
    emv("62", emv("05", "***")) +
    "6304";
  p += crc16(p);
  return p;
}

// txid: 26–35 caracteres alfanuméricos (regra do BACEN).
export function gerarTxid(): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let t = "BRASA";
  for (let i = 0; i < 27; i++) t += chars[Math.floor(Math.random() * chars.length)];
  return t;
}

// Cria a cobrança imediata (PUT /api/v3/cob/{txid} no Sicredi) e devolve o copia-e-cola.
export async function criarCobrancaPix(dados: {
  txid: string;
  valor: number;
  nomeDevedor?: string;
  expiracaoSeg?: number;
  descricao?: string;
}) {
  const token = await obterToken();
  // devedor só com nome não é aceito pelo padrão BACEN (exige cpf/cnpj junto);
  // o nome do cliente vai em infoAdicionais, que aparece pro pagador.
  const body = {
    calendario: { expiracao: dados.expiracaoSeg ?? 1800 },
    // modalidadeAlteracao 0 = pagador NÃO pode mudar o valor (recomendação do Sicredi)
    valor: { original: dados.valor.toFixed(2), modalidadeAlteracao: 0 },
    chave: CHAVE_PIX,
    solicitacaoPagador: (dados.descricao ?? "Pedido Brasa").slice(0, 140),
    ...(dados.nomeDevedor ? { infoAdicionais: [{ nome: "Cliente", valor: dados.nomeDevedor.slice(0, 200) }] } : {}),
  };
  const r = await ufetch(`${URL_API}/api/${COB_VERSAO}/cob/${dados.txid}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    dispatcher: getDispatcher(),
  });
  const j = (await r.json().catch(() => null)) as { location?: string; loc?: { location?: string }; pixCopiaECola?: string; brcode?: string; detail?: string } | null;
  if (!r.ok || !j) throw new Error(`cob HTTP ${r.status}${j?.detail ? `: ${j.detail}` : ""}`);
  const location = j.location || j.loc?.location || "";
  // Alguns PSPs já devolvem o copia-e-cola pronto; senão, montamos do location.
  const copiaECola = j.pixCopiaECola || j.brcode || (location ? montarBrCode(location, "BRASA PIZZARIA", "IVOTI") : "");
  if (!copiaECola) throw new Error("cobrança sem location/brcode");
  return { txid: dados.txid, location, copiaECola };
}

// Consulta a cobrança: status CONCLUIDA = pago.
export async function consultarCobrancaPix(txid: string) {
  const token = await obterToken();
  const r = await ufetch(`${URL_API}/api/${COB_VERSAO}/cob/${txid}`, {
    headers: { Authorization: `Bearer ${token}` },
    dispatcher: getDispatcher(),
  });
  if (!r.ok) throw new Error(`consulta HTTP ${r.status}`);
  const j = (await r.json()) as { status?: string };
  return { status: j.status ?? "ATIVA", pago: j.status === "CONCLUIDA" };
}
