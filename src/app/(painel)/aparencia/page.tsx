import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { lerMarca } from "@/lib/marca";
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
    </div>
  );
}
