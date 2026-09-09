import Link from "next/link";
import { colabPedidos, listarMinhasSolicitacoes } from "./compras-actions";
import { ComprasColab } from "./form";

export const metadata = { title: "Compra ou manutenção · Brasa" };

export default async function ComprasColabPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const colab = await colabPedidos(token);

  if (!colab) {
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <p className="text-zinc-500">Entre com o PIN de novo pra fazer o pedido.</p>
        <Link href={`/eu/${token}`} className="mt-3 inline-block text-sm text-orange-600">← Voltar</Link>
      </div>
    );
  }

  const lista = await listarMinhasSolicitacoes(colab.id);

  return (
    <div className="mx-auto min-h-screen max-w-md bg-zinc-50 p-4 pb-16 dark:bg-zinc-950">
      <Link href={`/eu/${token}`} className="text-sm text-zinc-500">← Voltar</Link>
      <h1 className="mt-2 mb-1 text-xl font-bold text-zinc-900 dark:text-zinc-50">🛠️ Compra ou manutenção</h1>
      <p className="mb-4 text-sm text-zinc-500">
        Olá, {colab.nome.split(" ")[0]} — faltou algo ou alguma coisa precisa de conserto? Anota aqui que o Rafael vê na lista dele.
      </p>
      <ComprasColab token={token} lista={lista} />
    </div>
  );
}
