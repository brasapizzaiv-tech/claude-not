import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { lerMarca } from "@/lib/marca";
import { comoReconheci } from "@/lib/empresa";
import { CoresForm } from "./cores-form";

// Aparência da empresa (Etapa 3 do design).
//
// É aqui que outro restaurante entra com a cara dele. Só do dono: a cor muda
// TODAS as telas, do painel ao cardápio que o cliente vê.
export default async function AparenciaPage() {
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

  const marca = await lerMarca();

  return (
    <div className="mx-auto max-w-[1100px] p-5">
      <Link href="/usuarios" className="text-sm text-texto-suave hover:underline">
        Configurações
      </Link>
      <h1 className="mt-1 font-numero text-2xl font-semibold tracking-apertada text-texto">
        Aparência da empresa
      </h1>
      <p className="mt-0.5 mb-4 text-sm text-texto-suave">
        As cores valem em todas as telas: painel, app do garçom, app da equipe e
        o cardápio que o cliente abre no celular.
      </p>

      <CoresForm
        inicial={{
          primaria: marca.primaria,
          escuro: marca.escuro,
          sobreEscuro: marca.sobreEscuro,
        }}
      />

      <QuemSouEu />
    </div>
  );
}

// De quem é este acesso (Etapa 1 do multiempresa).
//
// Enquanto só existe a Brasa, isto parece bobo. Deixa de parecer no dia em que
// alguém disser "estou vendo os dados de outro restaurante": esta é a primeira
// tela a olhar, porque ela mostra COMO o sistema chegou nessa conclusão.
async function QuemSouEu() {
  const { fonte, empresa } = await comoReconheci();
  const explicacao: Record<string, string> = {
    perfil: "pelo seu login",
    colaborador: "pelo link pessoal de um colaborador",
    endereco: "pelo endereço desta página",
    unica: "por ser a única empresa cadastrada",
    nenhuma: "não consegui identificar",
  };

  return (
    <section className="mt-6 rounded-cartao bg-painel-cartao p-4">
      <p className="text-xs font-medium text-texto-fraco">Empresa deste acesso</p>
      <p className="mt-1 font-numero text-lg font-semibold tracking-apertada text-texto">
        {empresa?.nome ?? "nenhuma"}
      </p>
      <p className="mt-0.5 text-sm text-texto-suave">
        Reconhecida {explicacao[fonte]}
        {empresa ? ` · apelido "${empresa.slug}"` : ""}.
      </p>
      {fonte === "unica" && (
        <p className="mt-3 border-t border-borda pt-3 text-sm text-texto-suave">
          Esta é a rede de segurança: enquanto só existe uma empresa, o sistema
          usa ela quando não consegue descobrir de outro jeito. Ao cadastrar a
          segunda, isso deixa de valer sozinho — de propósito.
        </p>
      )}
    </section>
  );
}
