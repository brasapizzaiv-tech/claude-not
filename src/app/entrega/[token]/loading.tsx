// Aparece na hora em que a pessoa clica, enquanto o app do entregador carrega.
// Sem isto a tela fica parada e parece travada. Ver src/components/esqueleto.tsx.
import { EsqueletoApp } from "@/components/esqueleto";

export default function Loading() {
  return <EsqueletoApp n={5} />;
}
