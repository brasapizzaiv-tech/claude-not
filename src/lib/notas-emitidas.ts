// Leitor do relatório de notas emitidas (HTML exportado como .xls pelo vmarket).

export type NotaEmitidaLida = {
  chave: string;
  numero: string;
  serie: string;
  modelo: string;
  status: string;
  valor: number;
  data_emissao: string | null;
  consumidor: string | null;
};

const dec = (s: string) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();

function parseData(s: string): string | null {
  // "11/08/2026, 23:04:44" → "2026-08-11"
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

export function lerRelatorioNotas(html: string): NotaEmitidaLida[] {
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  const out: NotaEmitidaLida[] = [];
  for (const r of rows) {
    const c = [...r[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) =>
      dec(m[1]),
    );
    if (c.length < 11) continue;
    const chave = c[10];
    if (!chave || !/^\d{40,}$/.test(chave)) continue; // pula cabeçalho/linhas inválidas
    const valor =
      Number(c[4].replace(/[^\d,]/g, "").replace(",", ".")) || 0;
    out.push({
      chave,
      numero: c[1],
      serie: c[2],
      modelo: c[3],
      status: c[0],
      valor,
      data_emissao: parseData(c[5]),
      consumidor: c[7] && c[7] !== "n/d" ? c[7] : null,
    });
  }
  return out;
}
