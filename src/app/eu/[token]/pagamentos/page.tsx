import Link from "next/link";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { brl, rotuloSemana, segundaDe, somarDias, ymd } from "@/lib/equipe";

export const metadata = { title: "Meus pagamentos · Brasa" };

const fData = (s: string | null | undefined) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : "");

// Página pessoal: cada um vê só o próprio acerto (exige PIN).
export default async function PagamentosColabPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();
  const { data: colab } = await admin
    .from("colaboradores")
    .select("id, nome, ativo, pin, turno, vinculo")
    .eq("token", token)
    .maybeSingle();
  const jar = await cookies();
  const pin = jar.get(`eu_${token}`)?.value ?? "";
  if (!colab || !colab.ativo || !colab.pin || colab.pin !== pin) {
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <p className="text-zinc-500">Entre com o seu PIN de novo pra ver os pagamentos.</p>
        <Link href={`/eu/${token}`} className="mt-3 inline-block text-sm text-orange-600">← Voltar</Link>
      </div>
    );
  }

  const hoje = ymd(new Date(new Date().getTime() - 3 * 3600 * 1000));
  const estaSegunda = segundaDe(hoje);

  const [{ data: pagos }, { data: pres }, { data: extra }] = await Promise.all([
    admin
      .from("semana_pagamentos")
      .select("segunda, valor, desconto, criado_em, lancamentos(descricao, pago, pago_em, data)")
      .eq("colaborador_id", colab.id)
      .order("segunda", { ascending: false })
      .limit(26),
    admin.from("presencas").select("data, turno").eq("colaborador_id", colab.id).gte("data", estaSegunda).lte("data", somarDias(estaSegunda, 6)),
    admin.from("semana_extras").select("valor, motivo").eq("colaborador_id", colab.id).eq("segunda", estaSegunda).maybeSingle(),
  ]);

  type Linha = {
    segunda: string; valor: number; desconto: number; criado_em: string;
    lancamentos: { descricao: string | null; pago: boolean; pago_em: string | null; data: string } | { descricao: string | null; pago: boolean; pago_em: string | null; data: string }[] | null;
  };
  const linhas = ((pagos as Linha[]) ?? []).map((l) => {
    const lanc = Array.isArray(l.lancamentos) ? l.lancamentos[0] : l.lancamentos;
    // Descrição vem como "Semana dd/mm a dd/mm — Nome (2 dias, 2 noites, 10% 180,00) · fiado…" → fica só o miolo.
    const detalhe = (lanc?.descricao ?? "").replace(/^Semana .*? — [^(]*/, "").trim();
    return {
      segunda: l.segunda,
      valor: Number(l.valor),
      desconto: Number(l.desconto) || 0,
      emMaos: Number(l.valor) - (Number(l.desconto) || 0),
      pago: !!lanc?.pago,
      pagoEm: lanc?.pago_em ?? null,
      detalhe,
      jaLancada: !!lanc,
    };
  });
  const semanaAtualLancada = linhas.some((l) => l.segunda === estaSegunda);
  const dias = (pres ?? []).filter((p) => p.turno === "dia").length;
  const noites = (pres ?? []).filter((p) => p.turno === "noite").length;
  const totalPago = linhas.filter((l) => l.pago).reduce((s, l) => s + l.emMaos, 0);

  return (
    <div className="mx-auto min-h-screen max-w-md bg-zinc-50 p-4 pb-24 dark:bg-zinc-950">
      <Link href={`/eu/${token}`} className="text-sm text-zinc-500">← Voltar</Link>
      <h1 className="mt-2 mb-1 text-xl font-bold text-zinc-900 dark:text-zinc-50">💵 Meus pagamentos</h1>
      <p className="mb-4 text-sm text-zinc-500">Olá, {String(colab.nome).split(" ")[0]} — aqui está o seu acerto de cada semana.</p>

      {!semanaAtualLancada && (
        <div className="mb-3 rounded-2xl border border-dashed border-zinc-300 p-4 text-sm dark:border-zinc-700">
          <div className="font-semibold text-zinc-900 dark:text-zinc-50">Semana atual · {rotuloSemana(estaSegunda)}</div>
          <div className="mt-1 text-zinc-600 dark:text-zinc-300">
            Marcado até agora: <b>{dias}</b> ☀️ dia{dias === 1 ? "" : "s"} · <b>{noites}</b> 🌙 noite{noites === 1 ? "" : "s"}
            {extra && Number(extra.valor) > 0 && <> · extra <b>{brl(Number(extra.valor))}</b>{extra.motivo ? ` (${extra.motivo})` : ""}</>}
          </div>
          <div className="mt-1 text-xs text-zinc-400">O valor aparece aqui quando a semana for fechada. Se algum dia estiver faltando, avise a gerência.</div>
        </div>
      )}

      {linhas.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 p-6 text-center text-sm text-zinc-500 dark:border-zinc-800">
          Nenhuma semana fechada ainda.
        </div>
      ) : (
        <ul className="space-y-3">
          {linhas.map((l) => (
            <li key={l.segunda} className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-zinc-900 dark:text-zinc-50">Semana {rotuloSemana(l.segunda)}</div>
                  {l.detalhe && <div className="mt-0.5 text-xs text-zinc-500">{l.detalhe.replace(/^\(|\)$/g, "")}</div>}
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${l.pago ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"}`}>
                  {l.pago ? `pago${l.pagoEm ? ` ${fData(l.pagoEm)}` : ""} ✓` : "aguardando pagamento"}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
                <div className="rounded-xl bg-zinc-50 p-2 dark:bg-zinc-950">
                  <div className="text-[10px] uppercase text-zinc-400">Semana</div>
                  <div className="font-semibold text-zinc-900 dark:text-zinc-100">{brl(l.valor)}</div>
                </div>
                <div className="rounded-xl bg-zinc-50 p-2 dark:bg-zinc-950">
                  <div className="text-[10px] uppercase text-zinc-400">Fiado desc.</div>
                  <div className={`font-semibold ${l.desconto > 0 ? "text-red-600" : "text-zinc-400"}`}>{l.desconto > 0 ? `− ${brl(l.desconto)}` : "—"}</div>
                </div>
                <div className="rounded-xl bg-emerald-50 p-2 dark:bg-emerald-950/30">
                  <div className="text-[10px] uppercase text-emerald-700 dark:text-emerald-300">Em mãos</div>
                  <div className="font-bold text-emerald-700 dark:text-emerald-300">{brl(l.emMaos)}</div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {linhas.length > 0 && (
        <p className="mt-4 text-center text-xs text-zinc-400">
          Recebido nas últimas {linhas.length} semana{linhas.length === 1 ? "" : "s"} fechadas: {brl(totalPago)}
        </p>
      )}
    </div>
  );
}
