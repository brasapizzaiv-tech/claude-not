// Aparece enquanto o cardápio carrega (13 consultas). Aqui quem espera é o
// cliente, no celular dele, e tela branca parada faz desistir do pedido.
// O desenho segue a tela de verdade: busca, categorias, mais vendidos e lista.
import { Bloco } from "@/components/esqueleto";

export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl p-4">
      <span role="status" aria-live="polite" className="sr-only">
        Carregando o cardápio…
      </span>

      {/* Topo com o nome da casa */}
      <div className="mb-4 flex items-center gap-3">
        <Bloco className="h-9 w-9 shrink-0 rounded-controle" />
        <div className="min-w-0 flex-1">
          <Bloco className="h-4 w-52" />
          <Bloco className="mt-2 h-3 w-40" />
        </div>
        <Bloco className="h-8 w-28 shrink-0 rounded-controle" />
      </div>

      {/* Busca */}
      <Bloco className="mb-3 h-11 w-full rounded-cartao" />

      {/* Categorias */}
      <div className="mb-5 flex gap-2 overflow-hidden">
        {["w-20", "w-24", "w-16", "w-20", "w-14"].map((w, i) => (
          <Bloco key={i} className={`h-8 shrink-0 rounded-full ${w}`} />
        ))}
      </div>

      {/* Os mais vendidos, lado a lado */}
      <Bloco className="mb-2.5 h-4 w-36" />
      <div className="mb-6 flex gap-3 overflow-hidden">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="w-40 shrink-0 rounded-cartao bg-painel-cartao">
            <Bloco className="h-24 w-full rounded-t-xl rounded-b-none" />
            <div className="p-2.5">
              <Bloco className="h-3.5 w-24" />
              <Bloco className="mt-2 h-3 w-14" />
            </div>
          </div>
        ))}
      </div>

      {/* Lista do cardápio */}
      <div className="space-y-2.5">
        {[...Array(7)].map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-cartao border border-borda p-3.5">
            <div className="min-w-0 flex-1">
              <Bloco className="h-4 w-44" />
              <Bloco className="mt-2 h-3 w-16" />
            </div>
            <Bloco className="h-8 w-8 shrink-0 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
