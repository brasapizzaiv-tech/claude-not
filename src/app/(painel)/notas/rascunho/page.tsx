import Link from "next/link";
import { fornecedoresDoRascunho } from "../actions";
import { LerRascunho } from "./ler-rascunho";

export const metadata = { title: "Rascunho à mão" };

// Compra sem nota (fruteira paga em dinheiro): foto do rascunho → IA lê →
// a pessoa confere → entra em Notas como nota pendente.
export default async function RascunhoPage() {
  const { ia, fornecedores } = await fornecedoresDoRascunho();
  return (
    <div className="pagina">
      <Link href="/notas" className="text-sm font-semibold text-texto-marca hover:underline">← Voltar para notas</Link>
      <h1 className="titulo-pagina mt-2">Rascunho à mão</h1>
      <p className="mt-1 max-w-3xl text-texto-suave">
        Pra compra que vem sem nota, só com a folha escrita à mão (ex.: fruteira paga em dinheiro). Tire a foto de cada
        folha, confira o que o sistema leu e salve: a compra entra em Notas como nota pendente, igual às outras.
      </p>
      {ia ? (
        <LerRascunho fornecedores={fornecedores} />
      ) : (
        <p className="cartao mt-6 p-5 text-sm text-texto-suave">A leitura por IA ainda não está ligada neste sistema.</p>
      )}
    </div>
  );
}
