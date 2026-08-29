import { NextResponse } from "next/server";

// Manifesto por pessoa: ao "adicionar à tela de início", o app instalado abre
// direto no link dela (/eu/{token}) — e não no site. Escopo "/" para o app
// continuar aberto ao navegar para Folgas (/folga/...) e Contagem (/contar/...).
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return NextResponse.json({
    name: "Brasa · Equipe",
    short_name: "Brasa",
    start_url: `/eu/${token}`,
    scope: "/",
    display: "standalone",
    background_color: "#f4f4f5",
    theme_color: "#f97316",
    icons: [{ src: "/logo-brasa.png", sizes: "any", type: "image/png", purpose: "any" }],
  });
}
