import { lerPaginaNfce, type CupomLido } from "@/lib/nfce-consulta-parse";

// Busca a NFC-e (cupom de supermercado etc.) na página pública da SEFAZ a
// partir do texto do QR code. Só o portal da SVRS (RS); o endereço é montado
// aqui (nunca seguimos um endereço qualquer que veio do QR).
const PORTAL = "https://dfe-portal.svrs.rs.gov.br/Dfe/QrCodeNFce";

/** O parâmetro "p" do QR: chave de 44 dígitos + versão + ambiente + ... + hash. */
export function parametroDoQr(texto: string): string | null {
  const t = (texto || "").trim();
  const m = t.match(/[?&]p=([^&#\s]+)/i);
  const p = decodeURIComponent(m ? m[1] : t);
  return /^\d{44}\|[0-9A-Za-z|]{3,200}$/.test(p) ? p : null;
}

export async function buscarCupomNfce(texto: string): Promise<{ ok: true; cupom: CupomLido } | { ok: false; erro: string }> {
  const p = parametroDoQr(texto);
  if (!p) return { ok: false, erro: "Leia o QR code do cupom. Só os números da chave não bastam: a SEFAZ pede o código inteiro do QR." };
  if (!p.startsWith("43")) return { ok: false, erro: "Por enquanto só cupons do Rio Grande do Sul." };
  let html = "";
  try {
    const r = await fetch(`${PORTAL}?p=${encodeURIComponent(p).replace(/%7C/gi, "|")}`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Motelli/1.0)", Accept: "text/html" },
      signal: AbortSignal.timeout(15000),
      redirect: "follow",
    });
    if (!r.ok) return { ok: false, erro: `A SEFAZ não respondeu (${r.status}). Tente de novo em alguns minutos.` };
    html = await r.text();
  } catch {
    return { ok: false, erro: "Não consegui falar com a SEFAZ agora. Tente de novo em alguns minutos." };
  }
  const cupom = lerPaginaNfce(html);
  if (!cupom.chave || cupom.itens.length === 0) {
    return { ok: false, erro: "A SEFAZ não devolveu os itens deste cupom (pode ser muito recente ou de contingência). Tente de novo mais tarde." };
  }
  return { ok: true, cupom };
}
