import https from "node:https";
import zlib from "node:zlib";
import forge from "node-forge";

// Lê o .pfx com node-forge (aceita a criptografia antiga dos certificados
// ICP-Brasil que o OpenSSL 3 recusa) e devolve chave + certificado em PEM.
export function pfxParaPem(pfxBase64: string, senha: string): { key: string; cert: string } {
  const der = forge.util.decode64(pfxBase64.trim());
  const asn1 = forge.asn1.fromDer(der);
  // strict=false: mais tolerante com variações do arquivo.
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, senha);

  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const kb = (keyBags[forge.pki.oids.pkcs8ShroudedKeyBag] ?? [])[0];
  if (!kb?.key) throw new Error("Chave privada não encontrada no certificado.");
  const key = forge.pki.privateKeyToPem(kb.key);

  const localKeyId = kb.attributes?.localKeyId?.[0];
  const certBags =
    p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ??
    [];
  const leaf =
    certBags.find((cb) => cb.attributes?.localKeyId?.[0] === localKeyId) ??
    certBags[0];
  if (!leaf?.cert) throw new Error("Certificado não encontrado no arquivo.");
  const cert = forge.pki.certificateToPem(leaf.cert);

  return { key, cert };
}

// NFeDistribuicaoDFe — serviço nacional. Puxa as NF-e emitidas contra o CNPJ.
const ENDPOINTS: Record<number, string> = {
  1: "https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
  2: "https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
};

type Opts = {
  pfxBase64: string;
  senha: string;
  cnpj: string;
  cuf: number;
  ambiente: number;
  ultNSU: string;
};

export type DocSefaz = { nsu: string; schema: string; xml: string };
export type RespostaSefaz = {
  cStat: string;
  xMotivo: string;
  ultNSU: string;
  maxNSU: string;
  docs: DocSefaz[];
  erro?: string;
};

function envelopeNSU(o: Opts) {
  const ult = (o.ultNSU || "0").padStart(15, "0");
  return `<?xml version="1.0" encoding="UTF-8"?><soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body><nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe"><nfeDadosMsg><distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.35"><tpAmb>${o.ambiente}</tpAmb><cUFAutor>${o.cuf}</cUFAutor><CNPJ>${o.cnpj}</CNPJ><distNSU><ultNSU>${ult}</ultNSU></distNSU></distDFeInt></nfeDadosMsg></nfeDistDFeInteresse></soap12:Body></soap12:Envelope>`;
}

// Envelope para baixar UMA nota específica pela chave (consChNFe).
// Não faz parte do "polling" (distNSU), então não cai no limite de 1/hora.
function envelopeChave(o: Opts, chNFe: string) {
  return `<?xml version="1.0" encoding="UTF-8"?><soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body><nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe"><nfeDadosMsg><distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.35"><tpAmb>${o.ambiente}</tpAmb><cUFAutor>${o.cuf}</cUFAutor><CNPJ>${o.cnpj}</CNPJ><consChNFe><chNFe>${chNFe}</chNFe></consChNFe></distDFeInt></nfeDadosMsg></nfeDistDFeInteresse></soap12:Body></soap12:Envelope>`;
}

async function postDist(o: Opts, body: string): Promise<RespostaSefaz> {
  const url = new URL(ENDPOINTS[o.ambiente] ?? ENDPOINTS[1]);

  // Extrai chave + certificado do .pfx (trata senha errada / arquivo inválido).
  let pem: { key: string; cert: string };
  try {
    pem = pfxParaPem(o.pfxBase64, o.senha);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      cStat: "",
      xMotivo: "",
      ultNSU: o.ultNSU || "0",
      maxNSU: o.ultNSU || "0",
      docs: [],
      erro: `Certificado (técnico): ${msg}`,
    };
  }

  let respostaXml = "";
  try {
    respostaXml = await new Promise<string>((resolve, reject) => {
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
            "Content-Type": "application/soap+xml; charset=utf-8",
            "Content-Length": Buffer.byteLength(body),
          },
        },
        (res) => {
          let data = "";
          res.on("data", (d) => (data += d));
          res.on("end", () => resolve(data));
        },
      );
      req.setTimeout(45000, () => req.destroy(new Error("Tempo esgotado ao falar com a SEFAZ.")));
      req.on("error", reject);
      req.write(body);
      req.end();
    });
  } catch (e) {
    return {
      cStat: "",
      xMotivo: "",
      ultNSU: o.ultNSU || "0",
      maxNSU: o.ultNSU || "0",
      docs: [],
      erro: e instanceof Error ? e.message : "Falha na conexão com a SEFAZ.",
    };
  }

  return parseResposta(respostaXml, o.ultNSU || "0");
}

export async function distribuicaoDFe(o: Opts): Promise<RespostaSefaz> {
  return postDist(o, envelopeNSU(o));
}

// Baixa a nota completa por chave (imediato, fora do limite do polling).
export async function distribuicaoPorChave(
  o: Opts,
  chNFe: string,
): Promise<RespostaSefaz> {
  return postDist(o, envelopeChave(o, chNFe));
}

function parseResposta(xml: string, ultNSUAtual: string): RespostaSefaz {
  const pick = (t: string) => {
    const m = xml.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`));
    return m ? m[1].trim() : "";
  };

  const docs: DocSefaz[] = [
    ...xml.matchAll(/<docZip\b([^>]*)>([\s\S]*?)<\/docZip>/g),
  ].map((m) => {
    const attrs = m[1];
    const nsu = (attrs.match(/NSU="(\d+)"/) || [])[1] ?? "";
    const schema = (attrs.match(/schema="([^"]*)"/) || [])[1] ?? "";
    let conteudo = "";
    try {
      conteudo = zlib.gunzipSync(Buffer.from(m[2].trim(), "base64")).toString("utf8");
    } catch {
      conteudo = "";
    }
    return { nsu, schema, xml: conteudo };
  });

  const cStat = pick("cStat");
  return {
    cStat,
    xMotivo: pick("xMotivo"),
    ultNSU: pick("ultNSU") || ultNSUAtual,
    maxNSU: pick("maxNSU") || ultNSUAtual,
    docs,
    // Se nem cStat veio, provavelmente é um erro de SOAP/certificado.
    erro: cStat ? undefined : xml ? "Resposta inesperada da SEFAZ." : undefined,
  };
}
