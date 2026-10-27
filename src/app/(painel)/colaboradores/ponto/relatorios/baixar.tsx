"use client";

// Planilha (CSV com ; e acento, abre direto no Excel) e impressão dos relatórios de ponto.
export function BaixarCsv({ nome, cabecalho, linhas }: { nome: string; cabecalho: string[]; linhas: (string | number)[][] }) {
  function baixar() {
    const csv = "﻿" + [cabecalho, ...linhas].map((l) => l.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `${nome}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  return <button type="button" onClick={baixar} className="btn-secundario">Baixar planilha</button>;
}

export function ImprimirRelatorio() {
  return <button type="button" onClick={() => window.print()} className="btn-secundario">Imprimir</button>;
}
