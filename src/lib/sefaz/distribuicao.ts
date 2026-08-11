import https from "node:https";
import zlib from "node:zlib";

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

function envelope(o: Opts) {
  const ult = (o.ultNSU || "0").padStart(15, "0");
  return `<?xml version="1.0" encoding="UTF-8"?><soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body><nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe"><nfeDadosMsg><distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.35"><tpAmb>${o.ambiente}</tpAmb><cUFAutor>${o.cuf}</cUFAutor><CNPJ>${o.cnpj}</CNPJ><distNSU><ultNSU>${ult}</ultNSU></distNSU></distDFeInt></nfeDadosMsg></nfeDistDFeInteresse></soap12:Body></soap12:Envelope>`;
}

export async function distribuicaoDFe(o: Opts): Promise<RespostaSefaz> {
  const url = new URL(ENDPOINTS[o.ambiente] ?? ENDPOINTS[1]);
  const body = envelope(o);

  let respostaXml = "";
  try {
    respostaXml = await new Promise<string>((resolve, reject) => {
      const req = https.request(
        {
          hostname: url.hostname,
          path: url.pathname,
          method: "POST",
          port: 443,
          pfx: Buffer.from(o.pfxBase64, "base64"),
          passphrase: o.senha,
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
      ultNSU: o.ultNSU,
      maxNSU: o.ultNSU,
      docs: [],
      erro: e instanceof Error ? e.message : "Falha na conexão com a SEFAZ.",
    };
  }

  return parseResposta(respostaXml, o.ultNSU);
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
