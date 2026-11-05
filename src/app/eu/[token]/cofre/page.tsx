import Link from "next/link";
import { CofreTela } from "@/app/(painel)/cofre/cofre-tela";
import {
  buscarContasAbertasApp, cancelarEncomendaApp, colabCofre, conferirCofreApp, dadosCofreApp, desfazerMovimentoApp, marcarEncomendaApp, pagarContaApp, registrarMovimentoApp, salvarFaixasApp,
} from "./actions";

export const metadata = { title: "Cofre · Brasa" };
export const dynamic = "force-dynamic";

// Só abre pra quem tem a caixinha "Cofre" e entrou com o PIN. A conferência é no
// servidor, aqui e em cada ação (não é só esconder o botão).
export default async function CofreAppPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [colab, dados] = await Promise.all([colabCofre(token), dadosCofreApp(token)]);

  if (!colab || !dados) {
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <p className="text-texto-suave">Esta tela é só pra quem tem a liberação do Cofre. Entre com o PIN de novo ou peça a liberação ao responsável.</p>
        <Link href={`/eu/${token}`} className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-texto-marca">← Voltar</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-painel-fundo pb-24">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 pt-3">
        <Link href={`/eu/${token}`} className="flex min-h-11 items-center text-sm font-semibold text-texto-marca">← Voltar</Link>
        <span className="text-xs text-texto-fraco">{colab.nome.split(" ")[0]}</span>
      </div>
      <CofreTela
        d={dados}
        noApp
        acoes={{
          registrarMovimento: registrarMovimentoApp.bind(null, token),
          pagarConta: pagarContaApp.bind(null, token),
          buscarContasAbertas: buscarContasAbertasApp.bind(null, token),
          conferirCofre: conferirCofreApp.bind(null, token),
          salvarFaixas: salvarFaixasApp.bind(null, token),
          marcarEncomenda: marcarEncomendaApp.bind(null, token),
          cancelarEncomenda: cancelarEncomendaApp.bind(null, token),
          desfazerMovimento: desfazerMovimentoApp.bind(null, token),
        }}
      />
    </div>
  );
}
