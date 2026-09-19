// Aparece na hora em que a pessoa clica, enquanto o quadro de pedidos carrega.
// Sem isto a tela fica parada e parece travada. Ver src/components/esqueleto.tsx.
import { EsqueletoCartoes } from "@/components/esqueleto";

export default function Loading() {
  return <EsqueletoCartoes n={9} largura="max-w-7xl" colunas="sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" />;
}
