import { scryptSync, randomBytes, timingSafeEqual, createHash } from "node:crypto";

// Senhas do app das marmitas (auditoria SEC-06). Antes ficavam em texto no
// mkt_config. Agora: "s1:<sal>:<hash>" com scrypt. A senha antiga em texto
// continua entrando uma vez e é trocada pelo hash no mesmo login.

export const SENHA_MIN = 6;

export function hashSenha(senha: string): string {
  const sal = randomBytes(16).toString("hex");
  const h = scryptSync(senha, sal, 32, { N: 4096 }).toString("hex");
  return `s1:${sal}:${h}`;
}

/** Confere a senha digitada com a guardada (hash novo ou texto antigo). */
export function senhaBate(guardada: string, digitada: string): boolean {
  if (!guardada || !digitada) return false;
  if (guardada.startsWith("s1:")) {
    const [, sal, h] = guardada.split(":");
    if (!sal || !h) return false;
    const a = Buffer.from(h, "hex");
    const b = scryptSync(digitada, sal, 32, { N: 4096 });
    return a.length === b.length && timingSafeEqual(a, b);
  }
  const a = Buffer.from(guardada);
  const b = Buffer.from(digitada);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const senhaEmTexto = (guardada: string) => !!guardada && !guardada.startsWith("s1:");

// Chave curta (não reversível) pra guardar em memória qual senha já conferiu,
// e não rodar o scrypt a cada chamada do painel.
export const impressao = (senha: string) => createHash("sha256").update("marmitas:" + senha).digest("hex");
