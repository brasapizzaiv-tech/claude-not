import { timingSafeEqual } from "node:crypto";

// Confere o segredo das rotinas automáticas (Vercel Cron manda no cabeçalho
// Authorization: Bearer <CRON_SECRET>). Só pelo cabeçalho: o "?key=" na URL
// ia parar nos logs (auditoria SEC-12). Sem a variável, recusa sempre.
export function cronAutorizado(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") ?? "";
  const esperado = `Bearer ${secret}`;
  const a = Buffer.from(auth);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}
