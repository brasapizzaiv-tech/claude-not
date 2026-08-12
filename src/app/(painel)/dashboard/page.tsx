import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { moedaBR } from "@/lib/format";

type Resumo = {
  faturamento_mes: number;
  faturamento_mes_ant: number;
  notas_mes: number;
  despesas_mes: number;
  contas_aberto: number;
  contas_vencidas: number;
  contas_vencer7: number;
  etiquetas_ativas: number;
  etiquetas_vencendo: number;
  etiquetas_vencidas: number;
  estoque_tem_contagem: boolean;
  estoque_valor: number;
  fornecedores: number;
  produtos: number;
  colaboradores: number;
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, { data: resumoData }] = await Promise.all([
    supabase
      .from("profiles")
      .select("nome, papel, permissoes")
      .eq("id", user?.id ?? "")
      .single(),
    supabase.rpc("painel_resumo"),
  ]);

  const admin = profile?.papel === "dono";
  const permissoes = (profile?.permissoes as string[] | null) ?? [];
  const pode = (k: string) => admin || permissoes.includes(k);
  const r = (resumoData as Resumo) ?? ({} as Resumo);

  const mesBruto = new Date().toLocaleDateString("pt-BR", { month: "long" });
  const mesNome = mesBruto.charAt(0).toUpperCase() + mesBruto.slice(1);
  const primeiroNome = (profile?.nome ?? "").split(" ")[0];

  return (
    <div className="mx-auto max-w-5xl p-8">
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
        {primeiroNome ? `Olá, ${primeiroNome}` : "Início"}
      </h1>
      <p className="mt-1 text-zinc-500">Resumo de {mesNome}</p>

      {/* Destaques */}
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {pode("financeiro") && (
          <Destaque
            href="/financeiro/vendas"
            icon="💵"
            titulo="Faturamento do mês"
            valor={moedaBR(r.faturamento_mes)}
            rodape={`Mês passado: ${moedaBR(r.faturamento_mes_ant)}`}
            cor="green"
          />
        )}
        {pode("financeiro") && (
          <Destaque
            href="/financeiro/contas"
            icon="📄"
            titulo="Contas a pagar em aberto"
            valor={moedaBR(r.contas_aberto)}
            rodape={
              r.contas_aberto > 0
                ? `${moedaBR(r.contas_vencidas)} vencidas · ${moedaBR(r.contas_vencer7)} vencem em 7 dias`
                : "Nenhuma conta em aberto 🎉"
            }
            cor={r.contas_vencidas > 0 ? "red" : "zinc"}
          />
        )}
        {pode("contagem") && (
          <Destaque
            href="/contagens"
            icon="📦"
            titulo="Valor em estoque"
            valor={r.estoque_tem_contagem ? moedaBR(r.estoque_valor) : "—"}
            rodape={
              r.estoque_tem_contagem
                ? "Última contagem × preço de referência"
                : "Finalize uma contagem para calcular"
            }
            cor="zinc"
          />
        )}
      </div>

      {/* Indicadores menores */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {pode("financeiro") && (
          <Stat
            href="/financeiro/vendas"
            icon="🧾"
            titulo="Notas emitidas no mês"
            valor={String(r.notas_mes ?? 0)}
          />
        )}
        {pode("financeiro") && (
          <Stat
            href="/financeiro"
            icon="📉"
            titulo="Despesas lançadas no mês"
            valor={moedaBR(r.despesas_mes)}
          />
        )}
        {pode("etiquetas") && (
          <Stat
            href="/etiquetas"
            icon="🏷️"
            titulo="Etiquetas a vencer"
            valor={String((r.etiquetas_vencidas ?? 0) + (r.etiquetas_vencendo ?? 0))}
            detalhe={
              r.etiquetas_vencidas > 0
                ? `${r.etiquetas_vencidas} já vencida(s)`
                : `${r.etiquetas_ativas ?? 0} ativas`
            }
            alerta={r.etiquetas_vencidas > 0}
          />
        )}
      </div>

      {/* Cadastros */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {pode("fornecedores") && (
          <Stat
            href="/fornecedores"
            icon="🚚"
            titulo="Fornecedores"
            valor={String(r.fornecedores ?? 0)}
          />
        )}
        {pode("produtos") && (
          <Stat
            href="/produtos"
            icon="📦"
            titulo="Produtos"
            valor={String(r.produtos ?? 0)}
          />
        )}
        {pode("colaboradores") && (
          <Stat
            href="/colaboradores"
            icon="👤"
            titulo="Colaboradores"
            valor={String(r.colaboradores ?? 0)}
          />
        )}
      </div>
    </div>
  );
}

function Destaque({
  href,
  icon,
  titulo,
  valor,
  rodape,
  cor,
}: {
  href: string;
  icon: string;
  titulo: string;
  valor: string;
  rodape: string;
  cor: "green" | "red" | "zinc";
}) {
  const valorCor =
    cor === "green"
      ? "text-green-600 dark:text-green-400"
      : cor === "red"
        ? "text-red-600 dark:text-red-400"
        : "text-zinc-900 dark:text-zinc-50";
  return (
    <Link
      href={href}
      className="rounded-2xl border border-zinc-200 bg-white p-5 transition hover:border-orange-300 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="flex items-center gap-2 text-sm font-medium text-zinc-500">
        <span className="text-lg">{icon}</span>
        {titulo}
      </div>
      <p className={`mt-2 text-2xl font-bold ${valorCor}`}>{valor}</p>
      <p className="mt-1 text-xs text-zinc-400">{rodape}</p>
    </Link>
  );
}

function Stat({
  href,
  icon,
  titulo,
  valor,
  detalhe,
  alerta,
}: {
  href: string;
  icon: string;
  titulo: string;
  valor: string;
  detalhe?: string;
  alerta?: boolean;
}) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-zinc-200 bg-white p-5 transition hover:border-orange-300 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="flex items-center justify-between">
        <span className="text-xl">{icon}</span>
        <span
          className={`text-2xl font-bold ${
            alerta
              ? "text-red-600 dark:text-red-400"
              : "text-zinc-900 dark:text-zinc-50"
          }`}
        >
          {valor}
        </span>
      </div>
      <p className="mt-2 text-sm font-medium text-zinc-600 dark:text-zinc-400">
        {titulo}
      </p>
      {detalhe && <p className="text-xs text-zinc-400">{detalhe}</p>}
    </Link>
  );
}
