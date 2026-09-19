import { respostaManifesto } from "@/lib/manifesto";

// Manifest do sistema (painel). Antes era um arquivo parado em public/ com
// theme_color "#f97316" — o laranja padrão do Tailwind, nem a cor da casa.
export const dynamic = "force-dynamic";

export function GET() {
  return respostaManifesto({
    sufixo: "Sistema",
    descricao: "Compras, cotação de fornecedores, conferência e financeiro.",
    startUrl: "/",
  });
}
