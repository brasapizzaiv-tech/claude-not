import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// motelli.com.br é o site da MARCA do sistema (apresentação + política de
// privacidade), não o sistema em si. Mora neste mesmo projeto, em /motelli, e
// quem chega por aquele domínio é levado pra lá sem passar pelo login. O
// domínio do restaurante continua abrindo o site dele na raiz (next.config).
const HOST_MOTELLI = /(^|\.)motelli\.com\.br$/i;

export async function middleware(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").split(":")[0];
  if (HOST_MOTELLI.test(host)) {
    // O app do entregador pergunta aqui pelo código de entrada (é o único
    // endereço fixo que ele conhece): essas rotas passam direto, sem login.
    if (request.nextUrl.pathname.startsWith("/api/entrega/")) return NextResponse.next();
    const url = request.nextUrl.clone();
    if (!url.pathname.startsWith("/motelli")) url.pathname = `/motelli${url.pathname === "/" ? "" : url.pathname}`;
    return NextResponse.rewrite(url);
  }
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Aplica em tudo, menos arquivos estáticos e imagens.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
