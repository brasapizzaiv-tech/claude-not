// Aparece na hora em que a pessoa clica, enquanto a semana da equipe carrega.
// Sem isto a tela fica parada e parece travada. Ver src/components/esqueleto.tsx.
import { EsqueletoTabela } from "@/components/esqueleto";

export default function Loading() {
  return <EsqueletoTabela colunas={9} linhas={14} largura="max-w-7xl" />;
}
