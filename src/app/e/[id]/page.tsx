import { createClient } from "@/lib/supabase/server";
import { dataBR } from "@/lib/format";

export default async function EtiquetaPublicaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.rpc("etiqueta_por_id", { p_id: id });

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-6 dark:bg-zinc-950">
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
            Etiqueta não encontrada
          </h1>
        </div>
      </div>
    );
  }

  const validade = data.validade as string | null;
  const vencida = validade ? validade < new Date().toISOString().slice(0, 10) : false;
  const manip = data.manipulado_em
    ? new Date(data.manipulado_em).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-6 dark:bg-zinc-950">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-center text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Brasa · Etiqueta #{data.numero}
        </p>
        <h1 className="mt-1 text-center text-2xl font-extrabold text-zinc-900 dark:text-zinc-50">
          {data.produto}
        </h1>
        {(data.conservacao || data.quantidade != null) && (
          <p className="mt-1 text-center text-sm text-zinc-500">
            {data.conservacao ? String(data.conservacao).toUpperCase() : ""}
            {data.conservacao && data.quantidade != null ? " · " : ""}
            {data.quantidade != null
              ? `${data.quantidade} ${data.unidade ?? ""}`
              : ""}
          </p>
        )}

        <div
          className={`mt-4 rounded-xl p-4 text-center ${
            vencida
              ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
              : "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300"
          }`}
        >
          <p className="text-xs uppercase">Validade</p>
          <p className="text-xl font-bold">
            {validade ? dataBR(validade) : "—"}
          </p>
          <p className="text-sm">{vencida ? "⚠ VENCIDA" : "✓ dentro da validade"}</p>
        </div>

        <div className="mt-4 space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
          <div>
            Manipulado em: <b className="text-zinc-800 dark:text-zinc-200">{manip}</b>
          </div>
          <div>
            Por:{" "}
            <b className="text-zinc-800 dark:text-zinc-200">
              {(data.colaborador as string) ?? "—"}
            </b>
          </div>
        </div>
      </div>
    </div>
  );
}
