const modulos = [
  {
    fase: "Fase 1",
    titulo: "Compras & Cotação",
    itens: [
      "Cadastro de fornecedores e produtos",
      "Contagem de estoque",
      "Cotação para fornecedores",
      "Comparação de preços e pedido",
    ],
    ativo: true,
  },
  {
    fase: "Fase 2",
    titulo: "Conferência",
    itens: ["Conferente valida os pedidos recebidos", "Observações e ajustes"],
    ativo: false,
  },
  {
    fase: "Fase 3",
    titulo: "Notas Fiscais / SEFAZ",
    itens: ["Cruzamento de notas via certificado digital", "Lançamento de notas"],
    ativo: false,
  },
  {
    fase: "Fase 4",
    titulo: "Financeiro / DRE",
    itens: ["Contas a pagar e categorias", "Faturamento x contas, gráficos"],
    ativo: false,
  },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-6 py-16 font-sans dark:bg-zinc-950">
      <main className="w-full max-w-4xl">
        <header className="mb-12 text-center">
          <span className="inline-block rounded-full bg-orange-100 px-3 py-1 text-sm font-medium text-orange-700 dark:bg-orange-950 dark:text-orange-300">
            Em construção
          </span>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-5xl">
            Sistema de Cotação
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-zinc-600 dark:text-zinc-400">
            Do estoque à compra: conte, cote, compare e peça — tudo em um lugar.
          </p>
          <a
            href="/login"
            className="mt-6 inline-block rounded-lg bg-orange-500 px-6 py-2.5 font-medium text-white transition hover:bg-orange-600"
          >
            Entrar
          </a>
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          {modulos.map((m) => (
            <div
              key={m.fase}
              className={`rounded-2xl border p-6 transition ${
                m.ativo
                  ? "border-orange-300 bg-white shadow-sm dark:border-orange-800 dark:bg-zinc-900"
                  : "border-zinc-200 bg-white/50 dark:border-zinc-800 dark:bg-zinc-900/40"
              }`}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  {m.fase}
                </span>
                {m.ativo && (
                  <span className="rounded-full bg-orange-500 px-2 py-0.5 text-xs font-medium text-white">
                    Em desenvolvimento
                  </span>
                )}
              </div>
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
                {m.titulo}
              </h2>
              <ul className="mt-3 space-y-1.5 text-sm text-zinc-600 dark:text-zinc-400">
                {m.itens.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="text-orange-500">•</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <footer className="mt-12 text-center text-sm text-zinc-400">
          Feito sob medida — Next.js + Supabase
        </footer>
      </main>
    </div>
  );
}
