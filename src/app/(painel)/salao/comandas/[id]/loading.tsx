// Aparece na hora em que a pessoa clica, enquanto a comanda carrega.
// Sem isto a tela fica parada e parece travada. Ver src/components/esqueleto.tsx.
import { EsqueletoPagina } from "@/components/esqueleto";

export default function Loading() {
  return <EsqueletoPagina largura="max-w-3xl" />;
}
