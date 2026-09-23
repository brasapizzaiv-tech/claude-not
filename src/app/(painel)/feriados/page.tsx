import { createClient } from "@/lib/supabase/server";
import { exigirAcesso } from "@/lib/permissoes-server";
import { somarDias, type Feriado } from "@/lib/feriados";
import { FeriadosClient } from "./client";

export const metadata = { title: "Feriados · Brasa" };
export const dynamic = "force-dynamic";

// FERIADOS E DATAS ESPECIAIS
//
// A pergunta que a casa faz toda semana é uma só: "no dia 12 a gente abre?".
// Antes ela não tinha onde ser respondida — cada um perguntava pro Rafael, e a
// resposta morria na conversa. Aqui ela é dada uma vez e aparece sozinha na TV
// da cozinha e no mural do escritório.
export default async function FeriadosPage() {
  await exigirAcesso("/feriados");
  const supabase = await createClient();
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

  // Tudo que vem aí, e o que passou há pouco — passado antigo não interessa a
  // ninguém e só faria a tela pesar.
  const { data } = await supabase
    .from("feriados")
    .select("id, data, data_fim, nome, situacao, detalhe")
    // Pelo FIM, não pelo começo: férias coletivas que já começaram ainda estão
    // valendo, e sumir da lista no primeiro dia seria o pior momento.
    .or(`data_fim.gte.${somarDias(hoje, -180)},and(data_fim.is.null,data.gte.${somarDias(hoje, -180)})`)
    .order("data");

  const feriados: Feriado[] = ((data as Record<string, unknown>[]) ?? []).map((f) => ({
    id: String(f.id),
    data: String(f.data).slice(0, 10),
    dataFim: (f.data_fim as string | null) ?? null,
    nome: String(f.nome ?? ""),
    situacao: String(f.situacao ?? "indefinido") as Feriado["situacao"],
    detalhe: (f.detalhe as string | null) ?? null,
  }));

  return (
    <div className="w-full p-5">
      <h1 className="font-numero text-2xl font-semibold tracking-apertada text-texto">
        Feriados e datas especiais
      </h1>
      <p className="mt-0.5 mb-5 max-w-[70ch] text-sm text-texto-suave">
        O que a casa faz em cada data. O que você marcar aqui aparece sozinho na
        TV da cozinha e no mural do escritório, então a equipe para de perguntar
        e ninguém mais descobre no dia.
      </p>

      <FeriadosClient feriados={feriados} hoje={hoje} />
    </div>
  );
}
