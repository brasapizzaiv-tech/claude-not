// Aparece na hora em que a pessoa clica, enquanto as notas fiscais carrega.
// Sem isto a tela fica parada e parece travada. Ver src/components/esqueleto.tsx.
import { EsqueletoTabela } from "@/components/esqueleto";

export default function Loading() {
  return <EsqueletoTabela colunas={6} linhas={12} largura="max-w-7xl" />;
}
