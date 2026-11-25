// Convênios de empresa no caixa (ex.: MBRF, 10% para quem mostra o crachá).
// Ficam em pdv_config, chave "convenios", como JSON: [{"nome":"MBRF","pct":10}].
// O botão no caixa preenche o desconto em % e o nome vai na observação do
// movimento ("Convênio MBRF 10%"), pra contar no fim do mês quantos usaram.

export type Convenio = { nome: string; pct: number };

export function lerConvenios(cfg: Record<string, string>): Convenio[] {
  try {
    const lista = JSON.parse(cfg.convenios || "[]") as unknown;
    if (!Array.isArray(lista)) return [];
    return lista
      .map((c) => ({ nome: String((c as Convenio)?.nome ?? "").trim().slice(0, 40), pct: Number((c as Convenio)?.pct) }))
      .filter((c) => c.nome && c.pct > 0 && c.pct <= 50);
  } catch {
    return [];
  }
}

export const rotuloConvenio = (c: Convenio) => `Convênio ${c.nome} ${String(c.pct).replace(".", ",")}%`;
