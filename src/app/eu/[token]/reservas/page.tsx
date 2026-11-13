import Link from "next/link";
import { ReservasHoje } from "@/app/(painel)/reservas/hoje/mobile";
import { atribuirMesaApp, colabRecepcao, marcarChegouApp, reservasDoDiaApp } from "./actions";

export const metadata = { title: "Reservas de hoje" };
export const dynamic = "force-dynamic";

const hojeBR = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

// Só abre pra quem tem a caixinha "Recepção" e entrou com o PIN. A conferência é
// no servidor, aqui e em cada ação (não é só esconder o botão).
export default async function ReservasAppPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const hoje = hojeBR();
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(sp.dia ?? "") ? sp.dia : hoje;
  const [colab, reservas] = await Promise.all([colabRecepcao(token), reservasDoDiaApp(token, dia)]);

  if (!colab || !reservas) {
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <p className="text-texto-suave">Esta tela é só pra quem tem a liberação da Recepção. Entre com o PIN de novo ou peça a liberação ao responsável.</p>
        <Link href={`/eu/${token}`} className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-texto-marca">← Voltar</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-painel-fundo">
      <div className="mx-auto flex w-full max-w-xl items-center justify-between px-4 pt-3">
        <Link href={`/eu/${token}`} className="flex min-h-11 items-center text-sm font-semibold text-texto-marca">← Voltar</Link>
        <span className="text-xs text-texto-fraco">{colab.nome.split(" ")[0]}</span>
      </div>
      <ReservasHoje
        dia={dia}
        hoje={hoje}
        reservas={reservas}
        base={`/eu/${token}/reservas`}
        acoes={{
          marcarChegou: marcarChegouApp.bind(null, token),
          atribuirMesa: atribuirMesaApp.bind(null, token),
        }}
      />
    </div>
  );
}
