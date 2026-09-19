// Esqueletos de carregamento.
//
// Servem pra tela responder na hora que a pessoa clica, em vez de ficar parada
// esperando o servidor. Aparece o contorno cinza do que vem, e o conteúdo
// verdadeiro entra por cima quando fica pronto. É o que resolve o "cliquei e
// não aconteceu nada, aí fiquei apertando de novo".
//
// Quem usa: os arquivos loading.tsx de cada pasta. O Next mostra sozinho.
//
// Quem não gosta de animação (ajuste do sistema operacional) recebe os blocos
// parados: a regra prefers-reduced-motion do globals.css cuida disso.

export function Bloco({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-md bg-zinc-200/80 dark:bg-zinc-800 ${className}`} />;
}

// Cabeçalho comum: título grande e uma legenda curta.
function Titulo({ largura = "w-56" }: { largura?: string }) {
  return (
    <div className="mb-5">
      <Bloco className="h-3 w-24" />
      <Bloco className={`mt-2.5 h-7 ${largura}`} />
    </div>
  );
}

// Aviso pra quem usa leitor de tela: a tela está carregando, não travou.
function Anuncio() {
  return (
    <span role="status" aria-live="polite" className="sr-only">
      Carregando…
    </span>
  );
}

/** Genérico: serve pra qualquer tela do painel que não tenha esqueleto próprio. */
export function EsqueletoPagina({ largura = "max-w-5xl" }: { largura?: string }) {
  return (
    <div className={`mx-auto ${largura} p-6 sm:p-8`}>
      <Anuncio />
      <Titulo />
      <div className="space-y-2.5">
        {[...Array(7)].map((_, i) => (
          <div key={i} className="rounded-xl border border-zinc-200 p-3.5 dark:border-zinc-800">
            <div className="flex items-center gap-3">
              <Bloco className="h-9 w-9 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1">
                <Bloco className="h-3.5 w-1/3" />
                <Bloco className="mt-2 h-3 w-1/2" />
              </div>
              <Bloco className="h-7 w-20 shrink-0" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Listagens com tabela (notas, contas, colaboradores, produtos…). */
export function EsqueletoTabela({
  colunas = 5,
  linhas = 9,
  largura = "max-w-6xl",
}: {
  colunas?: number;
  linhas?: number;
  largura?: string;
}) {
  return (
    <div className={`mx-auto ${largura} p-6 sm:p-8`}>
      <Anuncio />
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Bloco className="h-3 w-24" />
          <Bloco className="mt-2.5 h-7 w-52" />
        </div>
        <Bloco className="h-9 w-32 rounded-lg" />
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
        <div className="flex gap-4 border-b border-zinc-200 bg-zinc-50 px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-900">
          {[...Array(colunas)].map((_, i) => (
            <Bloco key={i} className={`h-3 ${i === 0 ? "flex-[2]" : "flex-1"}`} />
          ))}
        </div>
        {[...Array(linhas)].map((_, l) => (
          <div key={l} className="flex gap-4 border-b border-zinc-100 px-4 py-3.5 last:border-0 dark:border-zinc-900">
            {[...Array(colunas)].map((_, i) => (
              <Bloco key={i} className={`h-3.5 ${i === 0 ? "flex-[2]" : "flex-1"}`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Telas de cartões lado a lado (delivery, painéis de resumo, etiquetas). */
export function EsqueletoCartoes({
  n = 6,
  colunas = "sm:grid-cols-2 lg:grid-cols-3",
  largura = "max-w-6xl",
}: {
  n?: number;
  colunas?: string;
  largura?: string;
}) {
  return (
    <div className={`mx-auto ${largura} p-6 sm:p-8`}>
      <Anuncio />
      <Titulo />
      <div className={`grid grid-cols-1 gap-3 ${colunas}`}>
        {[...Array(n)].map((_, i) => (
          <div key={i} className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="flex items-center justify-between">
              <Bloco className="h-4 w-20" />
              <Bloco className="h-5 w-16 rounded-full" />
            </div>
            <Bloco className="mt-3.5 h-3.5 w-3/4" />
            <Bloco className="mt-2 h-3 w-1/2" />
            <Bloco className="mt-4 h-8 w-full rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Relatórios com números grandes em cima e uma tabela embaixo. */
export function EsqueletoRelatorio({ cartoes = 4, largura = "max-w-6xl" }: { cartoes?: number; largura?: string }) {
  return (
    <div className={`mx-auto ${largura} p-6 sm:p-8`}>
      <Anuncio />
      <Titulo largura="w-64" />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[...Array(cartoes)].map((_, i) => (
          <div key={i} className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <Bloco className="h-3 w-20" />
            <Bloco className="mt-3 h-7 w-28" />
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
        {[...Array(8)].map((_, l) => (
          <div key={l} className="flex gap-4 border-b border-zinc-100 px-4 py-3.5 last:border-0 dark:border-zinc-900">
            <Bloco className="h-3.5 flex-[2]" />
            <Bloco className="h-3.5 flex-1" />
            <Bloco className="h-3.5 flex-1" />
            <Bloco className="h-3.5 flex-1" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** App de celular (garçom, /eu, entregador): lista de cartões em tela cheia. */
export function EsqueletoApp({ n = 8 }: { n?: number }) {
  return (
    <div className="mx-auto max-w-xl p-4">
      <Anuncio />
      <div className="mb-4 flex items-center gap-3">
        <Bloco className="h-10 w-10 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <Bloco className="h-4 w-40" />
          <Bloco className="mt-2 h-3 w-24" />
        </div>
      </div>
      <div className="space-y-2.5">
        {[...Array(n)].map((_, i) => (
          <div key={i} className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="flex items-center justify-between gap-3">
              <Bloco className="h-4 w-1/2" />
              <Bloco className="h-4 w-16 shrink-0" />
            </div>
            <Bloco className="mt-2.5 h-3 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
