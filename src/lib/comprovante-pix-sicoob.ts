// Lê o PDF de comprovantes do Sicoob (Internet Banking → CNAB → Comprovantes,
// "Comprovante de efetivação de transferência Pix"), já em texto. Cada
// comprovante vira um item: quem recebeu, o pedaço do CPF que o banco mostra
// (***.437.060-** → "437060", dígitos 4 a 9), valor, hora e o ID da transação.
// Sem import do resto do sistema: dá pra testar sozinho.

export type ComprovantePix = {
  nome: string;
  cpfMeio: string | null; // dígitos 4 a 9 do CPF de quem recebeu
  valorCentavos: number;
  quando: string | null; // "AAAA-MM-DDTHH:MM:SS" (horário de Brasília)
  idTransacao: string;
  situacao: string;
  ok: boolean; // "Finalizado com sucesso"
};

const TITULO = /COMPROVANTE DE EFETIVA\S*O DE TRANSFER\S*NCIA PIX/i;

export function lerComprovantesSicoob(texto: string): ComprovantePix[] {
  const blocos = String(texto ?? "").split(TITULO).slice(1);
  const lista: ComprovantePix[] = [];
  for (const b of blocos) {
    // O pagador também tem "Nome:" e "CPF/CNPJ:": lê só depois de "Destinatário".
    const i = b.search(/Destinat\S*rio\s*:/i);
    if (i < 0) continue;
    const dest = b.slice(i);
    const nome = dest.match(/Nome\s*:\s*([\s\S]+?)\s*CPF\s*\/\s*CNPJ/i)?.[1]?.replace(/\s+/g, " ").trim() ?? "";
    const cpf = dest.match(/CPF\s*\/\s*CNPJ\s*:\s*\*{3}\.(\d{3})\.(\d{3})-\*{2}/i);
    const valor = dest.match(/Valor\s*:\s*R\$\s*([\d.]+,\d{2})/i)?.[1];
    const dt = dest.match(/Data do pagamento\s*:\s*(\d{2})\/(\d{2})\/(\d{4})\s*-\s*(\d{2}):(\d{2}):(\d{2})/i);
    const id = dest.match(/ID Transa\S*\s*:\s*([A-Za-z0-9]{20,40})/i)?.[1];
    const situacao = dest.match(/Situa\S* do pagamento\s*:\s*(.+?)(?:\s*OUVIDORIA|\r?\n|$)/i)?.[1]?.trim() ?? "";
    if (!valor || !id) continue;
    lista.push({
      nome,
      cpfMeio: cpf ? cpf[1] + cpf[2] : null,
      valorCentavos: Math.round(Number(valor.replace(/\./g, "").replace(",", ".")) * 100),
      quando: dt ? `${dt[3]}-${dt[2]}-${dt[1]}T${dt[4]}:${dt[5]}:${dt[6]}` : null,
      idTransacao: id,
      situacao,
      ok: /sucesso/i.test(situacao),
    });
  }
  return lista;
}
