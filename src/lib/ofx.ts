// Leitor de extrato bancário OFX (formatos 1.x SGML e 2.x XML).

export type TransacaoOfx = {
  data: string; // AAAA-MM-DD
  valor: number; // negativo = saída
  descricao: string;
  fitid: string;
};

const tag = (bloco: string, nome: string) => {
  const m = bloco.match(new RegExp(`<${nome}>([^<\\r\\n]*)`, "i"));
  return m ? m[1].trim() : "";
};

export function lerOfx(ofx: string): TransacaoOfx[] {
  const blocos = ofx.split(/<STMTTRN>/i).slice(1);
  return blocos
    .map((b) => {
      const dt = tag(b, "DTPOSTED").replace(/[^0-9]/g, "").slice(0, 8);
      const data =
        dt.length === 8
          ? `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}`
          : "";
      const valor = Number(tag(b, "TRNAMT").replace(",", "."));
      const descricao = (tag(b, "MEMO") || tag(b, "NAME") || "").trim();
      const fitid = tag(b, "FITID");
      return { data, valor, descricao, fitid };
    })
    .filter((t) => t.data && t.fitid && !isNaN(t.valor));
}
