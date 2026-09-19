// Aparece na hora em que a pessoa clica, enquanto a comparação de preços carrega.
// Sem isto a tela fica parada e parece travada. Ver src/components/esqueleto.tsx.
import { EsqueletoTabela } from "@/components/esqueleto";

export default function Loading() {
  return <EsqueletoTabela colunas={7} linhas={12} largura="max-w-7xl" />;
}
