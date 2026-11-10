import Link from "next/link";
import { Icone } from "@/components/icone";
import { dataBR } from "@/lib/format";
import { empresaAtualId } from "@/lib/empresa";
import { exigirAcesso } from "@/lib/permissoes-server";
import { lerConfigSefaz } from "@/lib/sefaz/busca";
import { SefazPainel } from "./sefaz-painel";

export default async function SefazPage() {
  // Só o dono (SO_DONO). Nunca traz cert_pfx/cert_senha para o cliente: a tela
  // recebe só "tem certificado: sim/não".
  await exigirAcesso("/notas/sefaz");
  const data = await lerConfigSefaz(await empresaAtualId());

  const status = {
    temCert: !!data?.cert_pfx,
    cnpj: (data?.cnpj as string) ?? "",
    cuf: (data?.cuf as number) ?? 43,
    ambiente: (data?.ambiente as number) ?? 1,
    cert_nome: (data?.cert_nome as string) ?? null,
    ult_nsu: (data?.ult_nsu as string) ?? "000000000000000",
    atualizado_em: (data?.atualizado_em as string) ?? null,
    bloqueado_ate: (data?.bloqueado_ate as string) ?? null,
    cert_validade: ((data as { cert_validade?: string | null } | null)?.cert_validade) ?? null,
    ultimo_cstat: ((data as { ultimo_cstat?: string | null } | null)?.ultimo_cstat) ?? null,
    ultimo_motivo: ((data as { ultimo_motivo?: string | null } | null)?.ultimo_motivo) ?? null,
    ultima_busca_em: ((data as { ultima_busca_em?: string | null } | null)?.ultima_busca_em) ?? null,
    ultima_busca_ok_em: ((data as { ultima_busca_ok_em?: string | null } | null)?.ultima_busca_ok_em) ?? null,
  };

  return (
    <div className="mx-auto max-w-3xl p-8">
      <Link href="/notas" className="text-sm font-semibold text-texto-marca hover:underline">← Voltar para notas
      </Link>
      <h1 className="mt-2 font-numero text-[28px] font-bold leading-[1.1] tracking-apertada text-texto">
        SEFAZ automático
      </h1>
      <p className="mt-1 mb-6 text-texto-suave">
        Baixa as notas fiscais direto da SEFAZ com seu certificado A1.
        {status.atualizado_em
          ? ` Atualizado em ${dataBR(status.atualizado_em)}.`
          : ""}
      </p>

      <div className="mb-6 rounded-controle bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
        <Icone nome="cadeado" tamanho={14} className="mr-1.5" /> Seu certificado e a senha ficam guardados no servidor só para
        conectar na SEFAZ. Ninguém além do sistema acessa. Use apenas em um
        equipamento de sua confiança.
      </div>

      <SefazPainel status={status} />
    </div>
  );
}
