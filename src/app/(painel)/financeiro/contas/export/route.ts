import { type NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { dataBR } from "@/lib/format";
import { consultarContas, type FiltroContas } from "../consulta";

// Relatório de Contas a Pagar pra mandar pra contabilidade.
//
// Antes isto gerava uma TABELA HTML com o nome terminado em .xls. O Excel abre,
// mas reclama toda vez: "o formato e a extensão não correspondem — o arquivo
// pode estar corrompido". E estava certo: o conteúdo era HTML, não planilha.
// Quem recebia via um susto antes de cada relatório.
//
// Agora é um .xlsx de verdade, feito com a mesma biblioteca que o sistema já
// usa pra LER planilha (a importação de faturamento). Sem aviso nenhum.
//
// Duas coisas que mudam junto, e que só uma planilha de verdade permite:
//   • o VALOR vai como número, não como o texto "R$ 1.234,56". Assim a
//     contabilidade soma, filtra e faz gráfico direto na coluna.
//   • as DATAS vão como texto no formato brasileiro, de propósito: data
//     "de verdade" no Excel vira número de série e, num computador com a
//     região em inglês, 03/09 aparece como 9 de março.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const f: FiltroContas = {
    status: sp.get("status") || "aberto",
    comp: sp.get("comp") || undefined,
    vde: sp.get("vde") || undefined,
    vate: sp.get("vate") || undefined,
    lde: sp.get("lde") || undefined,
    late: sp.get("late") || undefined,
    pde: sp.get("pde") || undefined,
    pate: sp.get("pate") || undefined,
    banco: sp.get("banco") || undefined,
    forma: sp.get("forma") || undefined,
    cat: sp.get("cat") || undefined,
  };

  const linhas = await consultarContas(f);
  const total = linhas.reduce((s, l) => s + Number(l.valor), 0);

  const cabecalho = [
    "Competência",
    "Lançamento",
    "Descrição",
    "Categoria",
    "Origem (Banco)",
    "Tipo Pagamento",
    "Vencimento",
    "Pagamento",
    "Status",
    "Valor",
  ];

  const corpo = linhas.map((l) => [
    dataBR(l.data),
    dataBR(l.lancamento_em),
    l.descricao ?? l.fornecedores?.nome ?? "Despesa",
    l.dre_categorias?.nome ?? "",
    l.banco ?? "",
    l.forma_pagamento ?? "",
    dataBR(l.vencimento),
    l.pago ? dataBR(l.pago_em) : "",
    l.pago ? "Pago" : "Pendente",
    Number(l.valor),
  ]);

  // Linha do total, na mesma coluna do valor.
  const rodape = [
    `TOTAL (${linhas.length} conta(s))`,
    "", "", "", "", "", "", "", "",
    total,
  ];

  const aba = XLSX.utils.aoa_to_sheet([cabecalho, ...corpo, [], rodape]);

  // Largura das colunas: sem isso tudo sai com a largura padrão e a descrição
  // aparece cortada até a pessoa arrastar coluna por coluna.
  aba["!cols"] = [
    { wch: 12 }, // competência
    { wch: 12 }, // lançamento
    { wch: 46 }, // descrição
    { wch: 24 }, // categoria
    { wch: 14 }, // banco
    { wch: 16 }, // tipo de pagamento
    { wch: 12 }, // vencimento
    { wch: 12 }, // pagamento
    { wch: 10 }, // situação
    { wch: 14 }, // valor
  ];

  // Formato de moeda na coluna do valor (é número por baixo; isto é só como
  // ele aparece). Vale pro corpo e pra linha do total.
  const ultima = corpo.length + 2; // cabeçalho + linhas + linha em branco
  for (let i = 1; i <= ultima; i++) {
    const cel = aba[XLSX.utils.encode_cell({ r: i, c: 9 })];
    if (cel && cel.t === "n") cel.z = 'R$ #,##0.00';
  }

  // Congela o cabeçalho: rolando 200 contas, ele fica visível.
  aba["!freeze"] = { xSplit: 0, ySplit: 1 };

  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, aba, "Contas a pagar");
  const buf = XLSX.write(livro, { type: "buffer", bookType: "xlsx" }) as Buffer;

  const nome = `contas-a-pagar${f.comp ? "-" + f.comp : ""}.xlsx`;
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nome}"`,
    },
  });
}
