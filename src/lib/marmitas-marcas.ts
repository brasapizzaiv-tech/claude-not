// Em quais marmitas do delivery vai cada prato do cardápio do dia (0265).
// Regra pura, usada pelo editor (painel e app da cozinha) e pela sincronia.
// Padrão quando o dia ainda não tem marcação: Tradicional leva tudo, Do Dia
// nada, Premium (só sábado) tudo.

export type QualMarmita = "tradicional" | "dia" | "premium";
export type Marmitas = Partial<Record<QualMarmita, string[]>>;

export const MARMITAS: { k: QualMarmita; rotulo: string; soSabado?: boolean }[] = [
  { k: "tradicional", rotulo: "Tradicional" },
  { k: "dia", rotulo: "Do Dia" },
  { k: "premium", rotulo: "Premium", soSabado: true },
];

/** dow: 0 = domingo … 6 = sábado. pratos = proteínas + acompanhamentos do dia. */
export function marcasDoDia(salvas: Marmitas | null | undefined, pratos: string[], dow: number): Record<QualMarmita, string[]> {
  const no = new Set(pratos);
  const ou = (k: QualMarmita, padrao: string[]) => (salvas && Array.isArray(salvas[k]) ? salvas[k]!.filter((n) => no.has(n)) : padrao);
  return { tradicional: ou("tradicional", pratos), dia: ou("dia", []), premium: dow === 6 ? ou("premium", pratos) : [] };
}

/** Prato novo no dia entra marcado onde o padrão manda (Tradicional; Premium no sábado). */
export function marcarPratoNovo(m: Record<QualMarmita, string[]>, nome: string, dow: number) {
  return { ...m, tradicional: [...m.tradicional, nome], premium: dow === 6 ? [...m.premium, nome] : m.premium };
}
