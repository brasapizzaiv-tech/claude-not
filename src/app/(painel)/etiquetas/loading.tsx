// Aparece na hora em que a pessoa clica, enquanto as etiquetas carrega.
// Sem isto a tela fica parada e parece travada. Ver src/components/esqueleto.tsx.
import { EsqueletoTabela } from "@/components/esqueleto";

export default function Loading() {
  return <EsqueletoTabela colunas={5} linhas={10} />;
}
