import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { exigirAcesso } from "@/lib/permissoes-server";
import { ListaCadastro, type ItemCadastro } from "./lista";

export const metadata = { title: "Cadastros · Colaboradores" };
export const dynamic = "force-dynamic";

// CADASTROS DA EQUIPE (migration 0257): as listas que a ficha usa, como no
// menu Cadastros do RHiD — departamentos, cargos e motivos de demissão, com
// quantas pessoas ativas estão em cada um.
export default async function CadastrosPage() {
  await exigirAcesso("/colaboradores");
  const supabase = await createClient();
  const [{ data: deps }, { data: cargos }, { data: motivos }, { data: cols }] = await Promise.all([
    supabase.from("departamentos").select("id, nome, ativo").order("nome"),
    supabase.from("cargos").select("id, nome, ativo").order("nome"),
    supabase.from("motivos_demissao").select("id, nome, ativo").order("nome"),
    supabase.from("colaboradores").select("departamento_id, cargo_id, motivo_demissao_id, ativo"),
  ]);
  type C = { departamento_id: string | null; cargo_id: string | null; motivo_demissao_id: string | null; ativo: boolean };
  const contar = (campo: keyof C, soAtivos: boolean) => {
    const m = new Map<string, number>();
    for (const c of (cols ?? []) as C[]) {
      const v = c[campo] as string | null;
      if (v && (!soAtivos || c.ativo)) m.set(v, (m.get(v) ?? 0) + 1);
    }
    return m;
  };
  const montar = (l: { id: string; nome: string; ativo: boolean }[] | null, n: Map<string, number>): ItemCadastro[] =>
    (l ?? []).filter((x) => x.ativo).map((x) => ({ id: x.id, nome: x.nome, pessoas: n.get(x.id) ?? 0 }));

  return (
    <div className="w-full max-w-6xl px-4 py-5 md:px-[30px] md:py-[26px]">
      <p className="rotulo"><Link href="/colaboradores" className="hover:text-texto">Colaboradores</Link></p>
      <h1 className="mt-1 font-numero text-[30px] font-bold leading-[1.05] tracking-apertada text-texto">Cadastros</h1>
      <p className="mt-1 max-w-2xl text-sm text-texto-suave">As listas que aparecem na ficha de cada pessoa. Apagar um item que alguém usa só tira ele das listas; o histórico continua.</p>
      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <ListaCadastro tabela="departamentos" titulo="Departamentos" contagem="pessoas ativas" itens={montar(deps, contar("departamento_id", true))} />
        <ListaCadastro tabela="cargos" titulo="Cargos" contagem="pessoas ativas" itens={montar(cargos, contar("cargo_id", true))} />
        <ListaCadastro tabela="motivos_demissao" titulo="Motivos de demissão" contagem="desligamentos" itens={montar(motivos, contar("motivo_demissao_id", false))} />
      </div>
    </div>
  );
}
