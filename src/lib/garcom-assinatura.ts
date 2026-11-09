import { createHmac, timingSafeEqual } from "node:crypto";

// Assinatura do cookie do modo garçom (auditoria SEC-05, 08/11/2026). Separado
// de garcom-auth.ts (que depende do Next) pra poder ser testado sozinho:
// scripts/garcom-assinatura.test.mjs.

function assinar(chave: string, token: string, pin: string | null): string {
  if (!chave) throw new Error("chave de assinatura ausente");
  return createHmac("sha256", "garcom-colab:" + chave).update(`${token}:${pin ?? ""}`).digest("base64url");
}

/** "token.assinatura" — só quem tem a chave do servidor gera. */
export function montarCookieGarcom(chave: string, token: string, pin: string | null): string {
  return `${token}.${assinar(chave, token, pin)}`;
}

/** O token do cookie, ou "" se não estiver no formato novo. */
export function tokenDoValor(valor: string): string {
  const i = valor.indexOf(".");
  return i > 0 ? valor.slice(0, i) : "";
}

/** O cookie confere com o token e o PIN atuais da pessoa? */
export function cookieGarcomConfere(chave: string, valor: string, token: string, pin: string | null): boolean {
  if (tokenDoValor(valor) !== token) return false;
  const veio = Buffer.from(valor.slice(token.length + 1));
  const certo = Buffer.from(assinar(chave, token, pin));
  return veio.length === certo.length && timingSafeEqual(veio, certo);
}
