// Pix via API Pix padrão BACEN. Roda só no servidor. Dois bancos suportados,
// escolhido por PIX_BANCO = "sicoob" | "sicredi" (padrão: o que tiver client id).
//
// SICOOB (developers.sicoob.com.br → Meus Aplicativos → API Pix):
//   PIX_SICOOB_CLIENT_ID    — Client ID da aplicação criada no portal
//   PIX_SICOOB_CHAVE        — chave Pix da conta da Brasa no Sicoob
//   PIX_SICOOB_AMBIENTE     — "sandbox" (padrão) ou "producao"
//   PIX_SICOOB_CERT_B64 / PIX_SICOOB_KEY_B64 — certificado e-CNPJ A1 (ICP-Brasil,
//       o MESMO da nota fiscal) em PEM, base64. Produção exige mTLS com ele; o
//       Sicoob não usa client_secret — a identidade é o certificado + client_id.
//   PIX_SICOOB_TOKEN_SANDBOX — token fixo que o portal mostra pro sandbox
//       (no sandbox não tem OAuth nem certificado)
//   PIX_SICOOB_ESCOPOS      — padrão "cob.read cob.write pix.read"
//
// SICREDI ("Guia Técnico Integração API Pix Sicredi v2.1"):
//   PIX_SICREDI_CLIENT_ID / PIX_SICREDI_CLIENT_SECRET — credenciais geradas NO
//       PORTAL a partir do CERTIFICADO VALIDADO (Certificados e Credenciais →
//       Gerar Credenciais). Credencial de app OAuth genérica não serve.
//   PIX_SICREDI_CHAVE       — a chave Pix da conta da Brasa
//   PIX_SICREDI_AMBIENTE    — "sandbox" (padrão, api-pix-h) ou "producao"
//   PIX_SICREDI_CERT_B64 / PIX_SICREDI_KEY_B64 — certificado validado pelo Sicredi
//       e chave privada SEM SENHA, em BASE64 (mTLS nos DOIS ambientes).
//       PIX_SICREDI_CA_B64 (opcional) — cadeia completa Sicredi.
//   PIX_SICREDI_ESCOPOS     — padrão "cob.read cob.write"
//   PIX_SICREDI_COB_VERSAO  — "v3" (padrão do Sicredi) ou "v2"
//   PIX_SICREDI_URL_API / PIX_SICREDI_URL_TOKEN — só se precisar sobrescrever
import { Agent, fetch as ufetch } from "undici";

type Banco = "sicoob" | "sicredi";
const BANCO: Banco =
  process.env.PIX_BANCO === "sicoob" || process.env.PIX_BANCO === "sicredi"
    ? (process.env.PIX_BANCO as Banco)
    : process.env.PIX_SICOOB_CLIENT_ID
      ? "sicoob"
      : "sicredi";

const env = (nome: string) => process.env[`PIX_${BANCO.toUpperCase()}_${nome}`] || "";
const AMBIENTE = env("AMBIENTE") === "producao" ? "producao" : "sandbox";
const CLIENT_ID = env("CLIENT_ID");
const CLIENT_SECRET = env("CLIENT_SECRET");
const CHAVE_PIX = env("CHAVE");

// Endereços por banco. URL_COB já inclui o prefixo até antes de "/cob".
const SICREDI_BASE = AMBIENTE === "producao" ? "https://api-pix.sicredi.com.br" : "https://api-pix-h.sicredi.com.br";
const URL_COB =
  env("URL_API") ||
  (BANCO === "sicoob"
    ? AMBIENTE === "producao"
      ? "https://api.sicoob.com.br/pix/api/v2"
      : "https://sandbox.sicoob.com.br/sicoob/sandbox/pix/api/v2"
    : `${SICREDI_BASE}/api/${process.env.PIX_SICREDI_COB_VERSAO === "v2" ? "v2" : "v3"}`);
const URL_TOKEN =
  env("URL_TOKEN") ||
  (BANCO === "sicoob"
    ? "https://auth.sicoob.com.br/auth/realms/cooperado/protocol/openid-connect/token"
    : `${SICREDI_BASE}/oauth/token`);
const ESCOPOS = (env("ESCOPOS") || (BANCO === "sicoob" ? "cob.read cob.write pix.read" : "cob.read cob.write")).trim();
const TOKEN_SANDBOX = BANCO === "sicoob" && AMBIENTE === "sandbox" ? process.env.PIX_SICOOB_TOKEN_SANDBOX || "" : "";

export function pixBanco(): Banco {
  return BANCO;
}

export function pixConfigurado() {
  if (!CLIENT_ID || !CHAVE_PIX) return false;
  if (BANCO === "sicoob") return !!(TOKEN_SANDBOX || (env("CERT_B64") && env("KEY_B64")));
  return !!CLIENT_SECRET;
}

// mTLS (certificado + chave privada). Sicredi: exigido em homologação e
// produção. Sicoob: exigido em produção (e-CNPJ A1); sandbox vai sem.
let dispatcher: Agent | undefined;
function getDispatcher() {
  if (dispatcher) return dispatcher;
  const b64 = (v?: string) => (v ? Buffer.from(v, "base64").toString("utf8") : undefined);
  const cert = b64(env("CERT_B64"));
  const key = b64(env("KEY_B64"));
  const ca = b64(env("CA_B64"));
  dispatcher = new Agent({ connect: { ...(cert && key ? { cert, key } : {}), ...(ca ? { ca } : {}) } });
  return dispatcher;
}

// Token OAuth (client_credentials) com cache até quase expirar (o Sicredi expira
// em 300 s e pode bloquear o IP por excesso de pedidos de token).
let tokenCache: { token: string; expira: number } | null = null;
async function obterToken(): Promise<string> {
  if (TOKEN_SANDBOX) return TOKEN_SANDBOX;
  if (tokenCache && Date.now() < tokenCache.expira) return tokenCache.token;
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
  const form = new URLSearchParams({ grant_type: "client_credentials", scope: ESCOPOS });
  let url = URL_TOKEN;
  if (BANCO === "sicoob") {
    // Sicoob: sem secret — client_id no corpo, identidade vem do certificado (mTLS).
    form.set("client_id", CLIENT_ID);
  } else {
    headers.Authorization = `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")}`;
    url = `${URL_TOKEN}?grant_type=client_credentials`;
  }
  const r = await ufetch(url, { method: "POST", headers, body: form.toString(), dispatcher: getDispatcher() });
  if (!r.ok) throw new Error(`token HTTP ${r.status}: ${(await r.text().catch(() => "")).slice(0, 200)}`);
  const j = (await r.json()) as { access_token: string; expires_in?: number };
  tokenCache = { token: j.access_token, expira: Date.now() + (Number(j.expires_in ?? 300) - 30) * 1000 };
  return j.access_token;
}

// Cabeçalhos de toda chamada à API (o Sicoob exige o client_id também no header).
async function headersApi(): Promise<Record<string, string>> {
  const h: Record<string, string> = { Authorization: `Bearer ${await obterToken()}` };
  if (BANCO === "sicoob") h.client_id = CLIENT_ID;
  return h;
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

// Cria a cobrança imediata (PUT .../cob/{txid}, padrão BACEN) e devolve o copia-e-cola.
export async function criarCobrancaPix(dados: {
  txid: string;
  valor: number;
  nomeDevedor?: string;
  expiracaoSeg?: number;
  descricao?: string;
}) {
  // devedor só com nome não é aceito pelo padrão BACEN (exige cpf/cnpj junto);
  // o nome do cliente vai em infoAdicionais, que aparece pro pagador.
  const body = {
    calendario: { expiracao: dados.expiracaoSeg ?? 1800 },
    // modalidadeAlteracao 0 = pagador NÃO pode mudar o valor 
    valor: { original: dados.valor.toFixed(2), modalidadeAlteracao: 0 },
    chave: CHAVE_PIX,
    solicitacaoPagador: (dados.descricao ?? "Pedido Brasa").slice(0, 140),
    ...(dados.nomeDevedor ? { infoAdicionais: [{ nome: "Cliente", valor: dados.nomeDevedor.slice(0, 200) }] } : {}),
  };
  const r = await ufetch(`${URL_COB}/cob/${dados.txid}`, {
    method: "PUT",
    headers: { ...(await headersApi()), "Content-Type": "application/json" },
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
  const r = await ufetch(`${URL_COB}/cob/${txid}`, {
    headers: await headersApi(),
    dispatcher: getDispatcher(),
  });
  if (!r.ok) throw new Error(`consulta HTTP ${r.status}`);
  const j = (await r.json()) as { status?: string };
  return { status: j.status ?? "ATIVA", pago: j.status === "CONCLUIDA" };
}
