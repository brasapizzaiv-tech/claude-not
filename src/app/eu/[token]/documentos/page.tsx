import Link from "next/link";
import { cookies } from "next/headers";
import { Icone } from "@/components/icone";
import { createAdminClient } from "@/lib/supabase/admin";
import { BotoesDocumento } from "./botoes";

export const metadata = { title: "Meus documentos · Brasa" };
export const dynamic = "force-dynamic";

const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(",", " às");

// MEUS DOCUMENTOS (migration 0257): o que a gestão pediu pra assinar
// (contrato, termo...). Abre o arquivo e assina com "Li e assino".
export default async function MeusDocumentosPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();
  const { data: c } = await admin.from("colaboradores").select("id, ativo, pin").eq("token", token).maybeSingle();
  const colab = c as { id: string; ativo: boolean; pin: string | null } | null;
  const pin = (await cookies()).get(`eu_${token}`)?.value ?? "";
  if (!colab || !colab.ativo || !colab.pin || colab.pin !== pin) {
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <p className="text-texto-suave">Entre com o seu PIN de novo pra ver os documentos.</p>
        <Link href={`/eu/${token}`} className="mt-3 inline-block min-h-11 text-sm font-semibold text-texto-marca">← Voltar</Link>
      </div>
    );
  }
  const { data } = await admin.from("colaborador_documentos").select("id, nome, tipo, assinado_em, criado_em")
    .eq("colaborador_id", colab.id).eq("pedir_assinatura", true).order("criado_em", { ascending: false });
  const docs = (data ?? []) as { id: string; nome: string; tipo: string | null; assinado_em: string | null; criado_em: string }[];
  const pendentes = docs.filter((d) => !d.assinado_em);
  const assinados = docs.filter((d) => d.assinado_em);

  return (
    <div className="mx-auto min-h-screen max-w-md bg-superficie-suave p-4 pb-24">
      <Link href={`/eu/${token}`} className="inline-flex min-h-11 items-center text-sm text-texto-suave">← Voltar</Link>
      <h1 className="mt-1 flex items-center gap-2 font-numero text-2xl font-bold tracking-apertada text-texto"><Icone nome="checklist" tamanho={20} /> Meus documentos</h1>
      <p className="mb-4 text-sm text-texto-suave">Abra, leia e assine o que a gestão mandou.</p>

      {pendentes.length > 0 && <p className="rotulo mb-2">Pra assinar</p>}
      {pendentes.map((d) => (
        <section key={d.id} className="cartao mb-3 p-4">
          <p className="font-semibold text-texto">{d.nome}</p>
          <p className="text-xs text-texto-suave">{d.tipo ? `${d.tipo} · ` : ""}enviado em {quando(d.criado_em)}</p>
          <BotoesDocumento token={token} docId={d.id} nome={d.nome} />
        </section>
      ))}
      {pendentes.length === 0 && <p className="cartao mb-3 p-4 text-sm text-texto-suave">Nenhum documento esperando a sua assinatura.</p>}

      {assinados.length > 0 && (
        <section className="cartao mt-4 p-4">
          <p className="rotulo mb-2">Já assinados</p>
          <ul className="divide-y divide-borda text-sm">
            {assinados.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 py-2">
                <span className="min-w-0"><span className="block truncate font-semibold text-texto">{d.nome}</span><span className="text-xs text-texto-suave">assinado em {quando(d.assinado_em as string)}</span></span>
                <BotoesDocumento token={token} docId={d.id} nome={d.nome} soAbrir />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
