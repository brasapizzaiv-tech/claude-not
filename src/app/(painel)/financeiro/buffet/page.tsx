import Link from "next/link";
import { Icone } from "@/components/icone";
import { createClient } from "@/lib/supabase/server";
import { buscarTodas } from "@/lib/supabase/todas";
import { hojeSP, somarDias } from "@/lib/etiqueta-vencimentos";
import { analisarDias, somar, limiteQueda, segundaDe, DELTAS, type PratoBuffet, type SomaBuffet } from "@/lib/buffet-analise-core";

export const metadata = { title: "Buffet: livre × quilo · Financeiro" };

// Acompanhamento semanal do buffet (Rafael, 27/10/2026): livre × quilo, quanto
// daria só por quilo e com o livre mais caro. Almoço, pelas pesagens da balança.
type ComandaRow = { aberta_em: string; livre: boolean | null; peso: number | null; valor_buffet: number | null; so_kg: boolean | null };

const PERIODOS = [4, 8, 12, 26];
const NOME_DIA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const diaSP = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const horaSP = (iso: string) => Number(new Date(iso).toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }));

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const brl0 = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const mais = (n: number) => `${n >= 0 ? "+" : "−"} ${brl0(Math.abs(n))}`;
const pct = (n: number) => `${Math.round(n * 100)}%`;
const kg1 = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const gramas = (kg: number) => `${Math.round(kg * 1000)} g`;
const dm = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
const faixa = (precos: number[]) => {
  const p = [...precos].sort((a, b) => a - b);
  return !p.length ? "—" : p[0] === p[p.length - 1] ? brl(p[0]) : `${brl(p[0])} a ${brl(p[p.length - 1])}`;
};

export default async function BuffetPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const semanas = PERIODOS.includes(Number(sp.semanas)) ? Number(sp.semanas) : 8;
  const hoje = hojeSP();
  const de = somarDias(segundaDe(hoje), -7 * (semanas - 1));

  const supabase = await createClient();
  const [comandas, { data: cfgRows }] = await Promise.all([
    buscarTodas<ComandaRow>((i, f) =>
      supabase.from("pdv_comandas").select("aberta_em, livre, peso, valor_buffet, so_kg")
        .gt("valor_buffet", 0).neq("status", "excluida").gte("aberta_em", `${de}T03:00:00.000Z`)
        .order("aberta_em").order("id").range(i, f),
    ),
    supabase.from("pdv_config").select("chave, valor"),
  ]);
  const cfg: Record<string, string> = {};
  for (const r of (cfgRows as { chave: string; valor: string }[]) ?? []) cfg[r.chave] = r.valor;
  const precoPadrao = (dow: number) => ({
    kg: Number(cfg[`preco_kg_${dow}`] || cfg.preco_kg || 0),
    livre: Number(cfg[`buffet_livre_${dow}`] || cfg.buffet_livre || 0),
  });

  // Só o almoço e sem as marmitas (so_kg): é o prato de quem come no salão.
  const pratos: PratoBuffet[] = comandas
    .filter((c) => !c.so_kg && horaSP(c.aberta_em) < 16)
    .map((c) => ({ dia: diaSP(c.aberta_em), livre: !!c.livre, peso: Number(c.peso) || 0, valor: Number(c.valor_buffet) || 0 }));
  const dias = analisarDias(pratos, precoPadrao);
  const total = somar(dias);

  const porSemana = new Map<string, typeof dias>();
  for (const d of dias) { const s = segundaDe(d.dia); porSemana.set(s, [...(porSemana.get(s) ?? []), d]); }
  const linhasSemana = [...porSemana].sort(([a], [b]) => b.localeCompare(a)).map(([seg, ds]) => ({ seg, s: somar(ds) }));

  const porDow = new Map<number, typeof dias>();
  for (const d of dias) porDow.set(d.dow, [...(porDow.get(d.dow) ?? []), d]);
  const linhasDow = [1, 2, 3, 4, 5, 6, 0].filter((w) => porDow.has(w)).map((w) => ({ w, s: somar(porDow.get(w)!) }));

  const pratosTotal = total.kgPratos + total.livrePratos;
  const difSoKg = total.soKg - total.valor;

  return (
    <div className="w-full p-6">
      <Link href="/financeiro" className="text-sm font-semibold text-texto-marca hover:underline">← Financeiro</Link>
      <h1 className="mt-2 flex items-center gap-2 font-numero text-[28px] font-bold leading-[1.1] tracking-apertada text-texto"><Icone nome="balanca" tamanho={20} /> Buffet: livre × quilo</h1>
      <p className="mb-4 mt-1 max-w-3xl text-sm text-texto-suave">
        Almoço, pelas pesagens da balança. Mostra quanto o livre rende, quanto as mesmas pessoas pagariam no quilo
        e o efeito de subir o livre. Quem aperta “Livre” sem pesar entra com a média de quem pesou no dia.
      </p>

      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Período">
        {PERIODOS.map((n) => (
          <Link key={n} href={`/financeiro/buffet?semanas=${n}`} aria-current={n === semanas ? "page" : undefined}
            className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold ${n === semanas ? "bg-texto text-painel-cartao" : "cartao text-texto"}`}>
            {n === 26 ? "6 meses" : `${n} semanas`}
          </Link>
        ))}
      </nav>

      {!dias.length ? (
        <p className="cartao p-6 text-sm text-texto-suave">Nenhum prato pesado no almoço neste período.</p>
      ) : (<>
        <div className="mb-4 grid gap-4 xl:grid-cols-[340px_1fr]">
          <div className="cartao-foco flex flex-col px-5 py-[18px]" style={{ "--foco": "var(--painel-foco-texto)" } as React.CSSProperties}>
            <span className="rotulo !text-painel-foco-rotulo">Se fosse tudo por quilo</span>
            <p className="numero-grande mt-1.5 text-[36px]">{mais(difSoKg)}</p>
            <p className="mt-0.5 text-[12.5px] text-painel-foco-suave">
              {pct(total.valor ? difSoKg / total.valor : 0)} a mais no buffet em {total.dias} almoços, se todo mundo continuasse comendo igual.
            </p>
            <p className="mt-3 border-t border-painel-foco-linha pt-3 text-[12.5px] text-painel-foco-suave">
              Se quem come no livre gastar <b className="text-painel-foco-texto">mais de {pct(limiteQueda(total))} menos</b> (comendo
              menos ou deixando de vir), o “só quilo” passa a render menos que hoje.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Bloco destaque rotulo="Pratos no livre" valor={pct(pratosTotal ? total.livrePratos / pratosTotal : 0)}
              linha={`${total.livrePratos} de ${pratosTotal} pratos · ${total.livreDiretos} sem pesar`} />
            <Bloco rotulo="Prato médio" valor={total.livrePesou ? gramas(total.livrePeso / total.livrePratos) : "—"}
              linha={`no livre · no quilo ${total.kgPratos ? gramas(total.kgPeso / total.kgPratos) : "—"}`} />
            <Bloco rotulo="Paga por pessoa" valor={total.livrePratos ? brl(total.livreValor / total.livrePratos) : "—"}
              linha={`no livre · no quilo ${total.kgPratos ? brl(total.kgValor / total.kgPratos) : "—"}`} />
            <Bloco rotulo="O livre sai a" valor={total.livrePeso ? `${brl(total.livreValor / total.livrePeso)}/kg` : "—"}
              linha={`o quilo sai a ${total.kgPeso ? brl(total.kgValor / total.kgPeso) : "—"}/kg`} />
          </div>
        </div>

        <section className="cartao mb-4 overflow-x-auto p-4">
          <p className="rotulo mb-2">Semana a semana</p>
          <table className="w-full min-w-[900px] text-sm [&_td]:pl-3 [&_th]:whitespace-nowrap [&_td:not(:first-child)]:whitespace-nowrap [&_th]:pl-3 [&_tr>*:first-child]:pl-0">
            <thead className="rotulo text-left">
              <tr>
                <th className="py-1.5">Semana</th>
                <th className="text-right">Pratos</th>
                <th className="text-right">No livre</th>
                <th className="text-right">Comida</th>
                <th className="text-right">Faturou</th>
                <th className="text-right">Por pessoa</th>
                <th className="text-right">Livre sai a</th>
                <th className="text-right">Só quilo daria</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {linhasSemana.map(({ seg, s }) => (
                <LinhaSemana key={seg} seg={seg} s={s} andamento={seg === segundaDe(hoje)} />
              ))}
            </tbody>
          </table>
        </section>

        <section className="cartao mb-4 overflow-x-auto p-4">
          <p className="rotulo mb-1">Se o livre subir</p>
          <p className="mb-3 text-xs text-texto-suave">
            Quanto o buffet teria faturado no período com o livre mais caro, cada pessoa comendo o mesmo prato.
            Quem pesou menos que o teto continua pagando o quilo.
          </p>
          <table className="w-full min-w-[760px] text-sm [&_td]:pl-3 [&_th]:whitespace-nowrap [&_td:not(:first-child)]:whitespace-nowrap [&_th]:pl-3 [&_tr>*:first-child]:pl-0">
            <thead className="rotulo text-left">
              <tr>
                <th className="py-1.5">Dia</th>
                <th className="text-right">Faturou</th>
                {DELTAS.map((d) => <th key={d} className="text-right">Livre + {brl0(d)}</th>)}
                <th className="text-right">Só quilo</th>
                <th className="text-right">Pode perder</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {linhasDow.map(({ w, s }) => (
                <tr key={w}>
                  <td className="py-2">
                    <span className="font-semibold text-texto">{NOME_DIA[w]}</span>
                    <span className="block text-xs text-texto-suave">livre {faixa(s.precosLivre)} · quilo {faixa(s.precosKg)}</span>
                  </td>
                  <td className="text-right font-numero">{brl0(s.valor)}</td>
                  {DELTAS.map((d) => <td key={d} className="text-right font-numero text-texto-suave">{mais(s.extra[d] ?? 0)}</td>)}
                  <td className="text-right font-numero font-semibold">{mais(s.soKg - s.valor)}</td>
                  <td className="text-right font-numero">{pct(limiteQueda(s))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-borda-forte font-semibold">
                <td className="py-2">Total</td>
                <td className="text-right font-numero">{brl0(total.valor)}</td>
                {DELTAS.map((d) => <td key={d} className="text-right font-numero">{mais(total.extra[d] ?? 0)}</td>)}
                <td className="text-right font-numero">{mais(difSoKg)}</td>
                <td className="text-right font-numero">{pct(limiteQueda(total))}</td>
              </tr>
            </tfoot>
          </table>
          <p className="mt-3 text-xs text-texto-suave">
            “Pode perder” = quanto a receita do livre pode cair antes do “só quilo” render menos que hoje.
            A conta supõe que ninguém muda de hábito, e não inclui o custo da comida: quem come menos também custa menos.
            Num teste de preço, compare aqui os pratos e o faturamento das semanas antes e depois.
          </p>
        </section>
      </>)}
    </div>
  );
}

function Bloco({ rotulo, valor, linha, destaque }: { rotulo: string; valor: string; linha: string; destaque?: boolean }) {
  return (
    <div className={`rounded-cartao p-4 ${destaque ? "bg-destaque" : "bg-superficie-suave"}`}>
      <p className="rotulo">{rotulo}</p>
      <p className="numero-grande mt-1 text-[24px] text-texto">{valor}</p>
      <p className="mt-0.5 text-xs text-texto-suave">{linha}</p>
    </div>
  );
}

function LinhaSemana({ seg, s, andamento }: { seg: string; s: SomaBuffet; andamento: boolean }) {
  const pratos = s.kgPratos + s.livrePratos;
  return (
    <tr>
      <td className="py-2">
        <span className="font-semibold text-texto">{dm(seg)} a {dm(somarDias(seg, 6))}</span>
        {andamento && <span className="pilula pilula-info ml-2">em andamento</span>}
        <span className="block text-xs text-texto-suave">{s.dias} {s.dias === 1 ? "almoço" : "almoços"} · livre {faixa(s.precosLivre)}</span>
      </td>
      <td className="text-right font-numero">{pratos}</td>
      <td className="text-right font-numero">
        {pct(pratos ? s.livrePratos / pratos : 0)}
        <span className="block text-xs font-normal text-texto-suave">{s.livrePratos} pratos</span>
      </td>
      <td className="text-right font-numero">~{kg1(s.kgPeso + s.livrePeso)} kg</td>
      <td className="text-right font-numero">{brl0(s.valor)}</td>
      <td className="text-right font-numero">
        {pratos ? brl(s.valor / pratos) : "—"}
        <span className="block text-xs font-normal text-texto-suave">livre {s.livrePratos ? brl(s.livreValor / s.livrePratos) : "—"} · quilo {s.kgPratos ? brl(s.kgValor / s.kgPratos) : "—"}</span>
      </td>
      <td className="text-right font-numero">{s.livrePeso ? `${brl(s.livreValor / s.livrePeso)}/kg` : "—"}</td>
      <td className="text-right font-numero font-semibold">{mais(s.soKg - s.valor)}</td>
    </tr>
  );
}
