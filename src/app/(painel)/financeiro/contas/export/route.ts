import { type NextRequest } from "next/server";
import { dataBR } from "@/lib/format";
import { consultarContas, type FiltroContas } from "../consulta";

const moeda = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Gera um Excel (tabela HTML) do Contas a Pagar para enviar à contabilidade.
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

  const corpo = linhas
    .map((l) => {
      const cols = [
        dataBR(l.data),
        dataBR(l.lancamento_em),
        esc(l.descricao ?? l.fornecedores?.nome ?? "Despesa"),
        esc(l.dre_categorias?.nome ?? ""),
        esc(l.banco ?? ""),
        esc(l.forma_pagamento ?? ""),
        dataBR(l.vencimento),
        l.pago ? dataBR(l.pago_em) : "",
        l.pago ? "Pago" : "Pendente",
        moeda(Number(l.valor)),
      ];
      return `<tr>${cols.map((c) => `<td>${c}</td>`).join("")}</tr>`;
    })
    .join("");

  const html =
    "﻿" +
    `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head>
<meta charset="utf-8">
</head><body>
<table border="1">
<thead><tr>${cabecalho.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
<tbody>${corpo}
<tr><td colspan="9"><b>TOTAL (${linhas.length} conta(s))</b></td><td><b>${moeda(total)}</b></td></tr>
</tbody></table></body></html>`;

  const nome = `contas-a-pagar${f.comp ? "-" + f.comp : ""}.xls`;
  return new Response(html, {
    headers: {
      "Content-Type": "application/vnd.ms-excel; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nome}"`,
    },
  });
}
