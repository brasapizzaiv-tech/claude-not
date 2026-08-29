import Link from "next/link";
import { cookies } from "next/headers";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dataBR } from "@/lib/format";
import { CriarPin, EntrarPin } from "./pin";
import { PedidosColab, type PedidoColab } from "./pedidos";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  return {
    title: "Brasa · Equipe",
    appleWebApp: { capable: true, statusBarStyle: "default", title: "Brasa" },
    // Manifesto próprio: o app instalado abre no link da pessoa, não no site.
    manifest: `/eu/${token}/manifest.json`,
  };
}

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-6 dark:bg-zinc-950">
      <div className="w-full max-w-sm rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-5 flex flex-col items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-brasa.png" alt="Brasa" className="h-14 w-14 object-contain" />
          <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Brasa · Equipe
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}

export default async function AppColaboradorPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();
  const { data: status } = await supabase.rpc("colaborador_status", {
    p_token: token,
  });

  if (!status) {
    return (
      <Moldura>
        <h1 className="text-center text-lg font-bold text-zinc-900 dark:text-zinc-50">
          Link inválido
        </h1>
        <p className="mt-2 text-center text-sm text-zinc-500">
          Peça um novo link ao responsável.
        </p>
      </Moldura>
    );
  }

  const nome = status.nome as string;
  const temPin = status.tem_pin as boolean;
  const saudacao = (
    <h1 className="mb-4 text-center text-xl font-bold text-zinc-900 dark:text-zinc-50">
      Olá, {nome} 👋
    </h1>
  );

  if (!temPin) {
    return (
      <Moldura>
        {saudacao}
        <CriarPin token={token} />
      </Moldura>
    );
  }

  const jar = await cookies();
  const pinCookie = jar.get(`eu_${token}`)?.value ?? "";
  let home: { nome: string; contagens: Contagem[] } | null = null;
  let pedidos: PedidoColab[] = [];
  let produtos: { id: string; nome: string }[] = [];
  if (pinCookie) {
    const [{ data }, { data: peds }] = await Promise.all([
      supabase.rpc("colaborador_home", { p_token: token, p_pin: pinCookie }),
      supabase.rpc("colaborador_pedidos", { p_token: token, p_pin: pinCookie }),
    ]);
    if (data && !data.erro) home = data as { nome: string; contagens: Contagem[] };
    if (peds && !peds.erro) {
      pedidos = (peds.pedidos as PedidoColab[]) ?? [];
      produtos = (peds.produtos as { id: string; nome: string }[]) ?? [];
    }
  }

  if (!home) {
    return (
      <Moldura>
        {saudacao}
        <EntrarPin token={token} />
      </Moldura>
    );
  }

  const contagens = home.contagens ?? [];

  // Hub: se a pessoa tem perfil de folga, mostra o atalho "Minhas folgas".
  const admin = createAdminClient();
  const [{ data: folgaProf }, { data: colab }] = await Promise.all([
    admin.from("folgas_funcionarios").select("id").eq("token", token).eq("ativo", true).maybeSingle(),
    admin.from("colaboradores").select("id, faz_contagem").eq("token", token).maybeSingle(),
  ]);
  const temFolga = !!folgaProf;
  const fazContagem = colab?.faz_contagem ?? true;

  // Minhas compras internas (só leitura).
  let compras: { item: string; valor: number; data: string; status: string; data_pagamento: string | null; obs_pagamento: string | null }[] = [];
  if (colab?.id) {
    const { data: rets } = await admin
      .from("retiradas")
      .select("item, valor, data, status, data_pagamento, obs_pagamento")
      .eq("colaborador_id", colab.id)
      .order("data", { ascending: false })
      .limit(60);
    compras = (rets as typeof compras) ?? [];
  }
  const abertoTotal = compras.filter((r) => r.status === "aberto").reduce((s, r) => s + Number(r.valor), 0);
  const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const fData = (s: string) => { const [, m, d] = s.split("-"); return `${d}/${m}`; };

  return (
    <Moldura>
      {saudacao}
      {temFolga && (
        <Link
          href={`/folga/${token}`}
          className="mb-3 block rounded-2xl bg-emerald-600 p-4 text-center font-semibold text-white hover:bg-emerald-700"
        >
          🌴 Minhas folgas
        </Link>
      )}
      {compras.length > 0 && (
        <div className="mb-3 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-semibold text-zinc-900 dark:text-zinc-50">🛒 Minhas compras</span>
            <span className={`text-sm font-bold ${abertoTotal > 0 ? "text-amber-600" : "text-emerald-600"}`}>
              {abertoTotal > 0 ? `Em aberto: ${brl(abertoTotal)}` : "Tudo pago ✓"}
            </span>
          </div>
          <ul className="space-y-1 text-sm">
            {compras.slice(0, 8).map((r, i) => (
              <li key={i} className="flex items-start justify-between gap-2 text-zinc-600 dark:text-zinc-300">
                <span className="min-w-0">
                  <span className="block truncate">{fData(r.data)} · {r.item}</span>
                  {r.status === "pago" && (r.data_pagamento || r.obs_pagamento) && (
                    <span className="block text-xs text-emerald-600">pago{r.data_pagamento ? ` ${fData(r.data_pagamento)}` : ""}{r.obs_pagamento ? ` · ${r.obs_pagamento}` : ""}</span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {brl(Number(r.valor))}
                  <span className={r.status === "pago" ? "text-emerald-600" : "text-amber-600"}>{r.status === "pago" ? "pago" : "aberto"}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {fazContagem && (
        <>
          {contagens.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
              Nenhuma contagem agora. 🍕
              <br />
              Volte no dia da contagem.
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-center text-sm text-zinc-500">
                Você tem contagem para fazer:
              </p>
              {contagens.map((c) => (
                <Link
                  key={c.token}
                  href={`/contar/${c.token}`}
                  className="block rounded-2xl bg-orange-500 p-4 text-center font-semibold text-white hover:bg-orange-600"
                >
                  📦 {c.descricao || "Contagem"}
                  {c.data && (
                    <span className="mt-0.5 block text-xs font-normal text-orange-100">
                      {dataBR(c.data)}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          )}

          <PedidosColab token={token} pedidos={pedidos} produtos={produtos} />
        </>
      )}
    </Moldura>
  );
}

type Contagem = { token: string; descricao: string | null; data: string | null };
