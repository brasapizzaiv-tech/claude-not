// Aparece na hora em que a pessoa clica, enquanto o cardápio do pedido novo carrega.
// Sem isto a tela fica parada e parece travada. Ver src/components/esqueleto.tsx.
import { EsqueletoCartoes } from "@/components/esqueleto";

export default function Loading() {
  return <EsqueletoCartoes n={8} largura="max-w-5xl" colunas="sm:grid-cols-2" />;
}
