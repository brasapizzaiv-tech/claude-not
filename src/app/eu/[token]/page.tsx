import Link from "next/link";
import { cookies } from "next/headers";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { dataBR } from "@/lib/format";
import { CriarPin, EntrarPin } from "./pin";
import { PedidosColab, type PedidoColab } from "./pedidos";

export const metadata: Metadata = {
  title: "Brasa · Contagem",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Brasa" },
};

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-6 dark:bg-zinc-950">
      <div className="w-full max-w-sm rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-5 flex flex-col items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-brasa.png" alt="Brasa" className="h-14 w-14 object-contain" />
          <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Contagem de estoque
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
  if (pinCookie) {
    const [{ data }, { data: peds }] = await Promise.all([
      supabase.rpc("colaborador_home", { p_token: token, p_pin: pinCookie }),
      supabase.rpc("colaborador_pedidos", { p_token: token, p_pin: pinCookie }),
    ]);
    if (data && !data.erro) home = data as { nome: string; contagens: Contagem[] };
    if (peds && !peds.erro) pedidos = (peds.pedidos as PedidoColab[]) ?? [];
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

  return (
    <Moldura>
      {saudacao}
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

      <PedidosColab token={token} pedidos={pedidos} />
    </Moldura>
  );
}

type Contagem = { token: string; descricao: string | null; data: string | null };
