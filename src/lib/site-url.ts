// Endereço público do sistema, igual no servidor e no navegador. Serve pra montar
// links que vão pra fora (fornecedor, colaborador, cliente). Ler
// window.location.origin na renderização dava link SEM o domínio: na primeira
// pintura (servidor) o window não existe, e o React não corrige atributos
// (href) na hidratação — o link ficava "/cotar/..." até algo re-renderizar.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.brasarestaurante.com.br").replace(/\/$/, "");

// No navegador prefere a origem real (funciona em localhost/preview); no
// servidor usa a constante. Resultado idêntico em produção.
export function siteUrl(): string {
  if (typeof window !== "undefined" && /^https?:\/\//.test(window.location.origin) && !window.location.origin.includes("localhost")) {
    return window.location.origin;
  }
  return SITE_URL;
}
