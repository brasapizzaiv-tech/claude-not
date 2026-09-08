import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config";
import { moduloDaRota, podeAcessar } from "@/lib/permissoes";

// Atualiza a sessão do usuário a cada requisição e protege as rotas privadas.
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
    error: erroAuth,
  } = await supabase.auth.getUser();

  // Rotas que exigem login. A raiz "/" e "/login" ficam liberadas.
  const path = request.nextUrl.pathname;

  // Falha TRANSITÓRIA do Supabase Auth (rede, limite de requisições, 5xx): não é
  // "sem sessão" — deixa a página seguir em vez de mandar pro login à toa.
  // Só "AuthSessionMissing" / sem cookie é tratado como deslogado.
  const falhaTransitoria =
    !user && !!erroAuth && !/session|jwt|token|refresh/i.test(`${erroAuth.name} ${erroAuth.message}`) &&
    request.cookies.getAll().some((c) => c.name.includes("-auth-token"));
  if (falhaTransitoria) {
    console.warn("[auth] getUser falhou de forma transitória:", erroAuth?.status, erroAuth?.message);
    return supabaseResponse;
  }
  const isPublic =
    path === "/" ||
    path.startsWith("/login") ||
    path.startsWith("/auth") ||
    path.startsWith("/contar") ||
    path.startsWith("/cotar") ||
    path.startsWith("/e/") ||
    path.startsWith("/eu/") ||
    path.startsWith("/garcom") ||
    path.startsWith("/folga/") ||
    path.startsWith("/balanca-teste") ||
    path.startsWith("/marmitas") ||
    path.startsWith("/pedir") ||
    path.startsWith("/site") ||
    path.startsWith("/api/marmitas") ||
    path.startsWith("/api/reservas") ||
    path.startsWith("/api/cardapio") ||
    path === "/cardapio" ||
    path.startsWith("/api/sefaz/") ||
    path.startsWith("/api/impressao/") ||
    path.startsWith("/api/balanca/") ||
    path.startsWith("/api/contagem/cron");

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    // Volta pra página que a pessoa queria depois de entrar.
    if (path !== "/dashboard") url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  // Bloqueio por módulo: se a rota pertence a um módulo, confere se o
  // funcionário tem acesso. O dono passa direto.
  if (user && !isPublic && moduloDaRota(path) !== null) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("papel, permissoes")
      .eq("id", user.id)
      .single();
    const admin = prof?.papel === "dono";
    const permissoes = (prof?.permissoes as string[] | null) ?? [];
    if (!podeAcessar(path, admin, permissoes)) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
