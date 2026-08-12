import https from "node:https";
import pkg from "xml-crypto";
import { pfxParaPem } from "./distribuicao";

const { SignedXml } = pkg;

// NFeRecepcaoEvento4 — Ambiente Nacional (manifestação do destinatário).
const ENDPOINTS: Record<number, string> = {
  1: "https://www1.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx",
  2: "https://hom1.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx",
};

const C14N = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
const ENVELOPED = "http://www.w3.org/2000/09/xmldsig#enveloped-signature";
const RSA_SHA1 = "http://www.w3.org/2000/09/xmldsig#rsa-sha1";
const SHA1 = "http://www.w3.org/2000/09/xmldsig#sha1";

function dhAgora() {
  // ISO com fuso -03:00
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const off = -d.getTimezoneOffset();
  const sinal = off >= 0 ? "+" : "-";
  const oh = pad(Math.floor(Math.abs(off) / 60));
  const om = pad(Math.abs(off) % 60);
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sinal}${oh}:${om}`
  );
}

// Monta e assina o evento "Ciência da Operação" (210210).
function eventoAssinado(
  chave: string,
  cnpj: string,
  ambiente: number,
  key: string,
  cert: string,
) {
  const seq = "01";
  const id = `ID210210${chave}${seq}`;
  const evento =
    `<evento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">` +
    `<infEvento Id="${id}">` +
    `<cOrgao>91</cOrgao><tpAmb>${ambiente}</tpAmb><CNPJ>${cnpj}</CNPJ>` +
    `<chNFe>${chave}</chNFe><dhEvento>${dhAgora()}</dhEvento>` +
    `<tpEvento>210210</tpEvento><nSeqEvento>1</nSeqEvento><verEvento>1.00</verEvento>` +
    `<detEvento versao="1.00"><descEvento>Ciencia da Operacao</descEvento></detEvento>` +
    `</infEvento></evento>`;

  const sig = new SignedXml({ privateKey: key, publicCert: cert });
  sig.signatureAlgorithm = RSA_SHA1;
  sig.canonicalizationAlgorithm = C14N;
  sig.addReference({
    xpath: "//*[local-name(.)='infEvento']",
    transforms: [ENVELOPED, C14N],
    digestAlgorithm: SHA1,
  });
  sig.computeSignature(evento, {
    location: { reference: "//*[local-name(.)='infEvento']", action: "after" },
  });
  return sig.getSignedXml();
}

export type RespManifesto = {
  cStat: string;
  xMotivo: string;
  ok: boolean;
  erro?: string;
};

export async function manifestarCiencia(o: {
  pfxBase64: string;
  senha: string;
  cnpj: string;
  ambiente: number;
  chNFe: string;
}): Promise<RespManifesto> {
  let pem: { key: string; cert: string };
  try {
    pem = pfxParaPem(o.pfxBase64, o.senha);
  } catch {
    return { cStat: "", xMotivo: "", ok: false, erro: "Certificado inválido ou senha incorreta." };
  }

  let eventoXml: string;
  try {
    eventoXml = eventoAssinado(o.chNFe, o.cnpj, o.ambiente, pem.key, pem.cert);
  } catch (e) {
    return { cStat: "", xMotivo: "", ok: false, erro: `Falha ao assinar: ${e instanceof Error ? e.message : e}` };
  }

  const envEvento =
    `<envEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">` +
    `<idLote>1</idLote>${eventoXml}</envEvento>`;
  const body =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">` +
    `<soap12:Body><nfeRecepcaoEvento xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4">` +
    `<nfeDadosMsg>${envEvento}</nfeDadosMsg></nfeRecepcaoEvento></soap12:Body></soap12:Envelope>`;

  const url = new URL(ENDPOINTS[o.ambiente] ?? ENDPOINTS[1]);
  let resp = "";
  try {
    resp = await new Promise<string>((resolve, reject) => {
      const req = https.request(
        {
          hostname: url.hostname,
          path: url.pathname,
          method: "POST",
          port: 443,
          key: pem.key,
          cert: pem.cert,
          minVersion: "TLSv1.2",
          headers: {
            "Content-Type":
              'application/soap+xml; charset=utf-8; action="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4/nfeRecepcaoEvento"',
            "Content-Length": Buffer.byteLength(body),
          },
        },
        (res) => {
          let data = "";
          res.on("data", (d) => (data += d));
          res.on("end", () => resolve(data));
        },
      );
      req.setTimeout(45000, () => req.destroy(new Error("Tempo esgotado.")));
      req.on("error", reject);
      req.write(body);
      req.end();
    });
  } catch (e) {
    return { cStat: "", xMotivo: "", ok: false, erro: e instanceof Error ? e.message : "Falha de conexão." };
  }

  const pick = (t: string) => {
    // pega o último cStat/xMotivo (o do retEvento, quando houver)
    const ms = [...resp.matchAll(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`, "g"))];
    return ms.length ? ms[ms.length - 1][1].trim() : "";
  };
  const cStat = pick("cStat");
  const xMotivo = pick("xMotivo");
  // 135/136 = registrado; 573 = já manifestado (também serve)
  const ok = ["135", "136", "573"].includes(cStat);
  // Sem cStat: mostra um trecho da resposta crua para diagnóstico.
  const trecho = resp.replace(/\s+/g, " ").slice(0, 500);
  return {
    cStat,
    xMotivo,
    ok,
    erro: cStat ? undefined : `SEFAZ respondeu: ${trecho || "(vazio)"}`,
  };
}
