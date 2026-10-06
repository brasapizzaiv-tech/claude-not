import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { todasFormas } from "@/lib/formas-pagamento-server";
import { FormasClient } from "./client";

export const metadata = { title: "Formas de pagamento · Brasa" };

// Cadastro das formas de pagamento da venda. Só do dono: uma forma nova
// aparece no caixa, no PDV, no delivery e no app do cliente.
export default async function FormasPagamentoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: perfil } = await supabase
    .from("profiles")
    .select("papel")
    .eq("id", user?.id ?? "")
    .maybeSingle();
  if (perfil?.papel !== "dono") redirect("/dashboard");

  const formas = await todasFormas();

  return (
    <div className="w-full p-4 sm:p-8">
      <div className="mb-6">
        <h1 className="font-numero text-2xl font-semibold tracking-apertada text-texto">Formas de pagamento</h1>
        <p className="mt-1 max-w-2xl text-texto-suave">
          O que o caixa, o PDV, o delivery, o app do cliente e o fiado oferecem na hora de receber.
          O <b>tipo</b> decide o comportamento: troco, pinpad (TEF), nota automática e o código fiscal da NFC-e.
        </p>
      </div>
      <FormasClient formas={formas} />
    </div>
  );
}
