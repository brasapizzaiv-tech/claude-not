// Prova de propriedade do motelli.com.br no Google Search Console (01/10/2026),
// exigida pela conta Play Console da organização. O Google pede este arquivo
// em https://motelli.com.br/google64837e4702eebfd1.html; o middleware reescreve
// o host motelli.com.br pra /motelli/..., por isso ele mora aqui. Não remover:
// o Google reconfere de tempos em tempos e a conta perde a verificação.
export const dynamic = "force-static";

export function GET() {
  return new Response("google-site-verification: google64837e4702eebfd1.html", {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
