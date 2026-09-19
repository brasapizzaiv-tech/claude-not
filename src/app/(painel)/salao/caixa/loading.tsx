// Aparece na hora em que a pessoa abre a Frente de Caixa, enquanto as 9
// consultas do banco rodam. É a tela mais usada sob pressão: sem isto ela fica
// parada depois de cada recebimento e parece travada.
//
// O desenho segue a tela de verdade — cabeçalho, botões, barra do resumo e a
// lista de comandas — pra nada pular de lugar quando o conteúdo chega.
import { Bloco } from "@/components/esqueleto";

export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl p-6">
      <span role="status" aria-live="polite" className="sr-only">
        Carregando a Frente de Caixa…
      </span>

      {/* Cabeçalho: caminho, título e os botões da direita */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Bloco className="h-3 w-28" />
          <Bloco className="mt-2.5 h-7 w-56" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Bloco className="h-9 w-36 rounded-lg" />
          <Bloco className="h-9 w-32 rounded-lg" />
          <Bloco className="h-9 w-28 rounded-lg" />
        </div>
      </div>

      {/* Linha de ações */}
      <div className="mb-4 flex flex-wrap gap-2">
        <Bloco className="h-9 w-44 rounded-lg" />
        <Bloco className="h-9 w-40 rounded-lg" />
      </div>

      {/* Barra do resumo (fechada, como fica de verdade) */}
      <div className="mb-4 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
        <div className="flex items-center justify-between">
          <Bloco className="h-4 w-48" />
          <Bloco className="h-4 w-24" />
        </div>
      </div>

      {/* Busca da comanda */}
      <Bloco className="mb-3 h-11 w-full rounded-xl sm:w-80" />

      {/* Lista de comandas abertas */}
      <div className="space-y-2.5">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="rounded-xl border border-zinc-200 p-3.5 dark:border-zinc-800">
            <div className="flex items-center gap-3">
              <Bloco className="h-10 w-10 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1">
                <Bloco className="h-4 w-32" />
                <Bloco className="mt-2 h-3 w-44" />
              </div>
              <Bloco className="h-5 w-20 shrink-0" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
