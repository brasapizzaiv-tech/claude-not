// Vale pra QUALQUER tela do painel que não tenha um loading.tsx próprio.
// O Next mostra isto assim que a pessoa clica no menu e troca pelo conteúdo
// verdadeiro quando o servidor responde. Ver src/components/esqueleto.tsx.
import { EsqueletoPagina } from "@/components/esqueleto";

export default function Loading() {
  return <EsqueletoPagina />;
}
