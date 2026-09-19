import Link from "next/link";
import { Icone } from "@/components/icone";
import { colabRodizio, saboresRodizio } from "./rodizio-actions";
import { RodizioForm } from "./form";

export const metadata = { title: "Rodízio · Brasa" };

export default async function RodizioColabPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const colab = await colabRodizio(token);

  if (!colab) {
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <p className="text-texto-suave">Só quem está no modo garçom lança pedidos do rodízio — ou entre com o PIN de novo.</p>
        <Link href={`/eu/${token}`} className="mt-3 inline-block text-sm text-orange-600">← Voltar</Link>
      </div>
    );
  }

  const sabores = await saboresRodizio();

  return (
    <div className="mx-auto min-h-screen max-w-md bg-superficie-suave p-4 pb-16">
      <div className="flex items-center justify-between">
        <Link href={`/eu/${token}`} className="text-sm text-texto-suave">← Voltar</Link>
        <span className="text-xs text-texto-fraco">{colab.nome.split(" ")[0]}</span>
      </div>
      <h1 className="mt-2 mb-3 text-xl font-bold text-texto"><Icone nome="pizza" tamanho={18} className="mr-2" /> Rodízio · pedir sabor</h1>
      <RodizioForm token={token} sabores={sabores} />
    </div>
  );
}
