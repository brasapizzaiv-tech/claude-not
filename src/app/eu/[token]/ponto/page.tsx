import Link from "next/link";
import { cookies } from "next/headers";
import { Icone } from "@/components/icone";
import { createAdminClient } from "@/lib/supabase/admin";
import { hojeSP } from "@/lib/assiduidade-server";
import { ASSINATURA_DESDE, assinaturasDoCiclo, cicloDoDia, ciclosRecentes, espelhoDaPessoa, resumoParaAssinar } from "@/lib/ponto-espelho";
import { duracao, hhmm, type SituacaoDia } from "@/lib/ponto-relatorio-core";
import { AssinarPonto } from "./assinar";

export const metadata = { title: "Meu ponto · Brasa" };
export const dynamic = "force-dynamic";

const DOW = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const SIT: Partial<Record<SituacaoDia, string>> = {
  falta: "Falta", incompleto: "Batida faltando", folga: "Folga", atestado: "Atestado",
  abono: "Abonado", feriado: "Feriado", hoje: "Hoje",
};
const quando = (iso: string) => {
  const l = new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  return l.replace(",", " às");
};

// MEU PONTO (migration 0254): cada um vê as próprias batidas do ciclo da
// folha (21 a 20), as horas, e assina o mês fechado — no lugar do papel do RHiD.
export default async function MeuPontoPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ de?: string }> }) {
  const { token } = await params;
  const { de: deParam } = await searchParams;
  const admin = createAdminClient();
  const { data: c } = await admin.from("colaboradores").select("id, nome, empresa_id, ativo, pin, bate_ponto").eq("token", token).maybeSingle();
  const colab = c as { id: string; nome: string; empresa_id: string; ativo: boolean; pin: string | null; bate_ponto: boolean } | null;
  const pin = (await cookies()).get(`eu_${token}`)?.value ?? "";
  if (!colab || !colab.ativo || !colab.pin || colab.pin !== pin) {
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <p className="text-texto-suave">Entre com o seu PIN de novo pra ver o seu ponto.</p>
        <Link href={`/eu/${token}`} className="mt-3 inline-block min-h-11 text-sm font-semibold text-texto-marca">← Voltar</Link>
      </div>
    );
  }

  const hoje = hojeSP();
  const ciclos = ciclosRecentes(hoje, 4);
  const ciclo = /^\d{4}-\d{2}-21$/.test(deParam ?? "") ? cicloDoDia(deParam as string) : ciclos[0];
  const fechado = ciclo.ate < hoje;
  const assina = ciclo.de >= ASSINATURA_DESDE;
  const periodo = `${dm(ciclo.de)} a ${dm(ciclo.ate)}`;

  const [e, assinaturas, { data: ult }] = await Promise.all([
    espelhoDaPessoa(admin, colab.id, ciclo.de, ciclo.ate, colab.empresa_id),
    assinaturasDoCiclo(admin, ciclo.de, ciclo.ate, [colab.id], colab.empresa_id),
    admin.from("ponto_batidas").select("data_hora, nsr, origem, desconsiderada").eq("colaborador_id", colab.id)
      .order("data_hora", { ascending: false }).limit(8),
  ]);
  const ultimas = (ult ?? []) as { data_hora: string; nsr: number; origem: string; desconsiderada: boolean }[];

  if (!e) {
    return (
      <div className="mx-auto min-h-screen max-w-md bg-superficie-suave p-4">
        <Link href={`/eu/${token}`} className="inline-flex min-h-11 items-center text-sm text-texto-suave">← Voltar</Link>
        <p className="cartao mt-3 p-5 text-sm text-texto-suave">O seu cadastro não está marcado pra bater ponto. Fale com a gestão.</p>
      </div>
    );
  }

  const { linhas, totais } = e;
  const assinatura = assinaturas.get(colab.id) ?? null;
  const { hash } = resumoParaAssinar(e);
  const mudou = !!assinatura && assinatura.hash !== hash;
  const assinado = assinatura?.resposta === "assinado" && !mudou;
  const precisaResponder = fechado && assina && !assinado;
  // Do mais novo pro mais antigo; dia sem batida e fora da escala não aparece, nem os que ainda vêm.
  const dias = linhas.filter((l) => l.dia <= hoje && (l.batidas.length || l.situacao !== "fora")).reverse();

  return (
    <div className="mx-auto min-h-screen max-w-md bg-superficie-suave p-4 pb-24">
      <Link href={`/eu/${token}`} className="inline-flex min-h-11 items-center text-sm text-texto-suave">← Voltar</Link>
      <h1 className="mt-1 flex items-center gap-2 font-numero text-2xl font-bold tracking-apertada text-texto"><Icone nome="relogio" tamanho={20} /> Meu ponto</h1>
      <p className="mb-3 text-sm text-texto-suave">As suas batidas no relógio, do dia 21 ao dia 20.</p>

      <nav className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" aria-label="Mês do ponto">
        {ciclos.map((x, i) => {
          const ativo = x.de === ciclo.de;
          return (
            <Link key={x.de} href={`/eu/${token}/ponto?de=${x.de}`} aria-current={ativo ? "page" : undefined}
              className={`inline-flex min-h-11 shrink-0 items-center rounded-full px-4 text-sm font-semibold ${ativo ? "pilula-grafite" : "bg-painel-cartao text-texto shadow-[var(--sombra-controle)]"}`}>
              {i === 0 ? "Este mês" : `${dm(x.de)} a ${dm(x.ate)}`}
            </Link>
          );
        })}
      </nav>

      <section className="cartao-foco p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-painel-foco-rotulo">
          {fechado ? `Fechado · ${periodo}` : `Até agora · ${periodo}`}
        </p>
        <p className="mt-1 font-numero text-[40px] font-bold leading-none tracking-apertada">{duracao(totais.trabalhado)}</p>
        <p className="mt-1 text-sm opacity-80">trabalhadas em {totais.diasTrabalhados} dia{totais.diasTrabalhados === 1 ? "" : "s"}</p>
        {!fechado && assina && <p className="mt-3 text-sm opacity-80">O mês fecha no dia {dm(ciclo.ate)}. No dia seguinte você confere e assina aqui.</p>}
        {fechado && assinado && (
          <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold"><Icone nome="ok" tamanho={16} /> Você assinou em {quando(assinatura!.criado_em)}</p>
        )}
        {fechado && mudou && <p className="mt-3 text-sm font-semibold">O ponto foi ajustado depois da sua resposta. Confira de novo.</p>}
        {fechado && !mudou && assinatura?.resposta === "discorda" && (
          <p className="mt-3 text-sm opacity-90">Você disse que não concorda: “{assinatura.comentario}”. A gestão vai conferir. Se já está resolvido, pode assinar.</p>
        )}
        {precisaResponder && !assinatura && <p className="mt-3 text-sm opacity-90">Confira os dias abaixo. Está tudo certo?</p>}
        {precisaResponder && <AssinarPonto token={token} de={ciclo.de} periodo={periodo} />}
      </section>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-cartao bg-painel-cartao p-3">
          <p className="rotulo">Extras</p>
          <p className="font-numero text-lg font-bold text-texto">{duracao(totais.extra)}</p>
        </div>
        <div className="rounded-cartao bg-painel-cartao p-3">
          <p className="rotulo">Falta/atraso</p>
          <p className="font-numero text-lg font-bold text-texto">{duracao(totais.faltante)}</p>
        </div>
        <div className={`rounded-cartao p-3 ${totais.faltas ? "bg-urgente-fundo" : "bg-painel-cartao"}`}>
          <p className="rotulo">Faltas</p>
          <p className={`font-numero text-lg font-bold ${totais.faltas ? "text-urgente-texto" : "text-texto"}`}>{totais.faltas}</p>
        </div>
      </div>

      <section className="cartao mt-3 overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-3 pb-1"><span className="rotulo">Dia</span><span className="rotulo">Saldo</span></div>
        {dias.length === 0 && <p className="px-4 pb-4 text-sm text-texto-suave">Nenhuma batida neste período.</p>}
        <ul className="divide-y divide-borda">
          {dias.map((l) => {
            const saldo = l.extraMin - l.faltaMin;
            const rot = SIT[l.situacao];
            return (
              <li key={l.dia} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-texto">{DOW[l.dow]} {dm(l.dia)}</p>
                  <p className="text-xs text-texto-suave">
                    {l.batidas.length ? l.batidas.map(hhmm).join(" · ") : ""}
                    {rot && <span className={l.situacao === "falta" || l.situacao === "incompleto" ? "font-semibold text-urgente-texto" : ""}>{l.batidas.length ? " — " : ""}{rot}</span>}
                    {l.atrasoMin > 0 && <span> · atraso {l.atrasoMin} min</span>}
                  </p>
                </div>
                <span className={`shrink-0 font-numero text-sm font-semibold ${saldo < 0 ? "text-urgente-texto" : saldo > 0 ? "text-ok-texto" : "text-texto-fraco"}`}>
                  {saldo === 0 ? "—" : `${saldo > 0 ? "+" : ""}${duracao(saldo)}`}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="cartao mt-3 p-4">
        <p className="rotulo mb-2">Últimas batidas (comprovante)</p>
        <ul className="space-y-1.5 text-sm">
          {ultimas.map((b) => (
            <li key={`${b.nsr}-${b.data_hora}`} className={`flex justify-between gap-2 ${b.desconsiderada ? "text-texto-fraco line-through" : "text-texto"}`}>
              <span>{quando(b.data_hora)}</span>
              <span className="text-xs text-texto-suave">{b.origem === "manual" ? "incluída pela gestão" : `relógio · nº ${b.nsr}`}</span>
            </li>
          ))}
          {ultimas.length === 0 && <li className="text-texto-suave">Nenhuma batida ainda.</li>}
        </ul>
      </section>
    </div>
  );
}
