import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { dataBR } from "@/lib/format";
import { SefazPainel } from "./sefaz-painel";

export default async function SefazPage() {
  const supabase = await createClient();
  // Nunca traz cert_pfx/cert_senha para o cliente.
  const { data } = await supabase
    .from("config_sefaz")
    .select(
      "cnpj, cuf, ambiente, cert_nome, cert_pfx, ult_nsu, atualizado_em, bloqueado_ate",
    )
    .limit(1)
    .maybeSingle();

  const status = {
    temCert: !!data?.cert_pfx,
    cnpj: (data?.cnpj as string) ?? "",
    cuf: (data?.cuf as number) ?? 43,
    ambiente: (data?.ambiente as number) ?? 1,
    cert_nome: (data?.cert_nome as string) ?? null,
    ult_nsu: (data?.ult_nsu as string) ?? "000000000000000",
    atualizado_em: (data?.atualizado_em as string) ?? null,
    bloqueado_ate: (data?.bloqueado_ate as string) ?? null,
  };

  return (
    <div className="mx-auto max-w-3xl p-8">
      <Link href="/notas" className="text-sm text-zinc-500 hover:text-orange-600">
        ← Voltar para notas
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
        SEFAZ automático
      </h1>
      <p className="mt-1 mb-6 text-zinc-500">
        Baixa as notas fiscais direto da SEFAZ com seu certificado A1.
        {status.atualizado_em
          ? ` Atualizado em ${dataBR(status.atualizado_em)}.`
          : ""}
      </p>

      <div className="mb-6 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
        🔒 Seu certificado e a senha ficam guardados no servidor só para
        conectar na SEFAZ. Ninguém além do sistema acessa. Use apenas em um
        equipamento de sua confiança.
      </div>

      <SefazPainel status={status} />
    </div>
  );
}
