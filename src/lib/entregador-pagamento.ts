// Quanto o entregador ganha num dia (acerto do painel e "Meus ganhos" no app).
// Regra do Rafael (28/10/2026), migration 0260:
// - almoço: fixo do dia, que já cobre as primeiras N teles GRÁTIS (entrega
//   grátis pro cliente); da N+1ª grátis em diante, um valor fixo por tele.
//   Tele cobrada do cliente paga o valor da área.
// - noite: fixo da noite + o valor da área de todas as teles.
// Sem regra do almoço (nulos), toda tele paga o valor da área, como antes.

export const HORA_FIM_ALMOCO = 15;

export type RegraEntregador = {
  fixoDia: number | null;
  fixoNoite: number | null;
  valorTele: number | null; // sem área: o valor por tele do entregador
  gratisIncluidasDia: number | null;
  valorGratisExtraDia: number | null;
};

export type EntregaAcerto = {
  id: string;
  quando: string; // ISO da entrega (ordena qual foi a 1ª, 2ª...)
  hora: number; // hora de São Paulo
  gratis: boolean; // taxa de entrega 0 pro cliente
  valorArea: number | null; // taxa_motoboy fixada na saída, senão a da área
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export function acertoDoDia(regra: RegraEntregador, entregas: EntregaAcerto[]) {
  const ordenadas = [...entregas].sort((a, b) => a.quando.localeCompare(b.quando));
  const temRegra = regra.gratisIncluidasDia != null;
  const incluidas = Math.max(0, regra.gratisIncluidasDia ?? 0);
  const porEntrega = new Map<string, number>();
  let gratisDia = 0, fezDia = false, fezNoite = false;
  for (const e of ordenadas) {
    const almoco = e.hora < HORA_FIM_ALMOCO;
    if (almoco) fezDia = true; else fezNoite = true;
    let valor: number;
    if (almoco && e.gratis && temRegra) {
      gratisDia++;
      valor = gratisDia <= incluidas ? 0 : Number(regra.valorGratisExtraDia ?? 0);
    } else {
      valor = Number(e.valorArea ?? regra.valorTele ?? 0);
    }
    porEntrega.set(e.id, r2(valor));
  }
  const teles = r2([...porEntrega.values()].reduce((s, v) => s + v, 0));
  const fixo = r2((fezDia ? Number(regra.fixoDia ?? 0) : 0) + (fezNoite ? Number(regra.fixoNoite ?? 0) : 0));
  return { porEntrega, teles, fixo, total: r2(teles + fixo), fezDia, fezNoite, gratisDia, gratisIncluidas: temRegra ? incluidas : null };
}
