import { respostaManifesto } from "@/lib/manifesto";

// Manifesto por pessoa: ao "adicionar à tela de início", o app instalado abre
// direto no link dela (/eu/{token}) — e não no site. Escopo "/" para o app
// continuar aberto ao navegar para Folgas (/folga/...) e Contagem (/contar/...).
//
// A cor e o logo vêm do cadastro da empresa. Antes o theme_color era
// "#f97316", o laranja padrão do Tailwind, e não a cor da casa.
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return respostaManifesto({
    sufixo: "Equipe",
    descricao: "App da equipe: folgas, compras, checklists e pagamentos.",
    startUrl: `/eu/${token}`,
    scope: "/",
  });
}
