// Aparece na hora em que a pessoa clica, enquanto o relatório do buffet carrega.
// Sem isto a tela fica parada e parece travada. Ver src/components/esqueleto.tsx.
import { EsqueletoRelatorio } from "@/components/esqueleto";

export default function Loading() {
  return <EsqueletoRelatorio />;
}
