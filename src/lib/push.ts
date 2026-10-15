// Notificações no celular (app Motelli Equipe) pelo Firebase Cloud Messaging,
// API HTTP v1. A chave da conta de serviço do projeto "motelli" mora na
// variável FIREBASE_SERVICE_ACCOUNT_B64 (o JSON em base64), nunca no código.
//
// Sem a variável, nada é enviado e ninguém quebra: notificar é sempre um
// extra — quem chama não espera, e erro aqui nunca impede a ação principal.
import { createSign } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

type Conta = { project_id: string; client_email: string; private_key: string };

let conta: Conta | null | undefined;
function lerConta(): Conta | null {
  if (conta !== undefined) return conta;
  try {
    const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
    conta = b64 ? (JSON.parse(Buffer.from(b64, "base64").toString("utf8")) as Conta) : null;
  } catch {
    conta = null;
  }
  return conta;
}

export const pushConfigurado = () => !!lerConta();

// Token de acesso do Google (OAuth2 com JWT assinado pela conta de serviço).
// Vale 1 h; guardado enquanto a função estiver de pé.
let acesso: { token: string; ate: number } | null = null;
async function tokenDeAcesso(c: Conta): Promise<string | null> {
  if (acesso && acesso.ate > Date.now() + 60_000) return acesso.token;
  const agora = Math.floor(Date.now() / 1000);
  const b64url = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const corpo = `${b64url({ alg: "RS256", typ: "JWT" })}.${b64url({
    iss: c.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: agora,
    exp: agora + 3600,
  })}`;
  const assinatura = createSign("RSA-SHA256").update(corpo).sign(c.private_key, "base64url");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${corpo}.${assinatura}` }),
  });
  if (!r.ok) return null;
  const j = (await r.json()) as { access_token?: string; expires_in?: number };
  if (!j.access_token) return null;
  acesso = { token: j.access_token, ate: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return acesso.token;
}

export type Aviso = { titulo: string; corpo: string; link?: string | null };

/** Manda pra uma lista de tokens; devolve os que o Firebase disse que morreram. */
async function enviar(tokens: string[], aviso: Aviso): Promise<{ enviados: number; mortos: string[] }> {
  const c = lerConta();
  if (!c || tokens.length === 0) return { enviados: 0, mortos: [] };
  const acessoToken = await tokenDeAcesso(c);
  if (!acessoToken) return { enviados: 0, mortos: [] };
  const url = `https://fcm.googleapis.com/v1/projects/${c.project_id}/messages:send`;
  let enviados = 0;
  const mortos: string[] = [];
  await Promise.all(tokens.map(async (token) => {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${acessoToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: aviso.titulo.slice(0, 120), body: aviso.corpo.slice(0, 400) },
            data: aviso.link ? { link: aviso.link } : {},
            android: { priority: "HIGH", notification: { sound: "default" } },
            apns: { payload: { aps: { sound: "default" } } },
          },
        }),
      });
      if (r.ok) { enviados++; return; }
      const txt = await r.text();
      // Celular que desinstalou o app ou trocou de token: apaga.
      if (r.status === 404 || /UNREGISTERED|INVALID_ARGUMENT.*registration/i.test(txt)) mortos.push(token);
    } catch { /* rede: tenta na próxima */ }
  }));
  return { enviados, mortos };
}

/** Avisa colaboradores (todos os celulares de cada um). Nunca lança erro. */
export async function notificarColaboradores(ids: string[], aviso: Aviso): Promise<number> {
  try {
    if (!pushConfigurado() || ids.length === 0) return 0;
    const admin = createAdminClient();
    const { data } = await admin.from("dispositivos_push").select("token").in("colaborador_id", [...new Set(ids)]);
    const tokens = ((data as { token: string }[]) ?? []).map((d) => d.token);
    const { enviados, mortos } = await enviar(tokens, aviso);
    if (mortos.length) await admin.from("dispositivos_push").delete().in("token", mortos);
    return enviados;
  } catch {
    return 0;
  }
}
