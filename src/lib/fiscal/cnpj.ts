// Dados públicos de um CNPJ (Receita Federal, pela BrasilAPI — grátis, sem
// chave). Preenche o cadastro do cliente pra NF-e: razão social e endereço.
// A inscrição estadual NÃO vem daqui: é digitada (ou "isento").

export type DadosCnpj = {
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
  logradouro: string;
  numero: string;
  complemento: string | null;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
  cod_municipio: string | null;
  telefone: string | null;
  email: string | null;
  situacao: string | null; // "ATIVA", "BAIXADA"...
  ie: string | null; // inscrição estadual ativa no estado do endereço (CNPJ.ws), se achou
};

// Sem um User-Agent a BrasilAPI responde 403 (o fetch do servidor não manda nenhum).
const CABECALHO = { "User-Agent": "Motelli/1.0 (+https://motelli.com.br)", Accept: "application/json" };

export const soDigitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

/** Confere os dois dígitos verificadores do CNPJ. */
export function cnpjValido(cnpj: string): boolean {
  const c = soDigitos(cnpj);
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const dv = (base: string) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const s = base.split("").reduce((acc, d, i) => acc + Number(d) * pesos[i], 0);
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(c.slice(0, 12)) === Number(c[12]) && dv(c.slice(0, 13)) === Number(c[13]);
}

// Inscrição estadual ativa no estado (CNPJ.ws, consulta pública). Sem resposta = null.
async function inscricaoEstadual(cnpj: string, uf: string): Promise<string | null> {
  try {
    const r = await fetch(`https://publica.cnpj.ws/cnpj/${cnpj}`, { signal: AbortSignal.timeout(8000), headers: CABECALHO });
    if (!r.ok) return null;
    const j = (await r.json()) as { estabelecimento?: { inscricoes_estaduais?: { inscricao_estadual?: string; ativo?: boolean; estado?: { sigla?: string } }[] } };
    const ies = j.estabelecimento?.inscricoes_estaduais ?? [];
    const ie = ies.find((x) => x.ativo && (!uf || x.estado?.sigla === uf)) ?? ies.find((x) => x.ativo);
    return ie?.inscricao_estadual ? soDigitos(ie.inscricao_estadual) : null;
  } catch {
    return null;
  }
}

export async function buscarCnpj(cnpj: string): Promise<{ ok: true; dados: DadosCnpj } | { ok: false; mensagem: string }> {
  const c = soDigitos(cnpj);
  if (!cnpjValido(c)) return { ok: false, mensagem: "CNPJ inválido. Confira os 14 números." };
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${c}`, { signal: AbortSignal.timeout(12000), headers: CABECALHO });
    if (r.status === 404) return { ok: false, mensagem: "CNPJ não encontrado na Receita." };
    if (!r.ok) return (await pelaCnpjWs(c)) ?? { ok: false, mensagem: "A consulta da Receita não respondeu agora. Preencha à mão ou tente de novo." };
    const j = (await r.json()) as Record<string, unknown>;
    const tipoLog = String(j.descricao_tipo_de_logradouro ?? "").trim();
    const log = String(j.logradouro ?? "").trim();
    const tel = String(j.ddd_telefone_1 ?? "").replace(/\D/g, "");
    return {
      ok: true,
      dados: {
        cnpj: c,
        razao_social: String(j.razao_social ?? "").trim(),
        nome_fantasia: String(j.nome_fantasia ?? "").trim() || null,
        logradouro: tipoLog && !log.toUpperCase().startsWith(tipoLog.toUpperCase()) ? `${tipoLog} ${log}` : log,
        numero: String(j.numero ?? "").trim() || "S/N",
        complemento: String(j.complemento ?? "").trim() || null,
        bairro: String(j.bairro ?? "").trim(),
        municipio: String(j.municipio ?? "").trim(),
        uf: String(j.uf ?? "").trim().toUpperCase(),
        cep: soDigitos(String(j.cep ?? "")),
        cod_municipio: j.codigo_municipio_ibge != null ? String(j.codigo_municipio_ibge) : null,
        telefone: tel.length >= 10 ? tel : null,
        email: String(j.email ?? "").trim().toLowerCase() || null,
        situacao: String(j.descricao_situacao_cadastral ?? "").trim() || null,
        ie: await inscricaoEstadual(c, String(j.uf ?? "").trim().toUpperCase()),
      },
    };
  } catch {
    return (await pelaCnpjWs(c)) ?? { ok: false, mensagem: "A consulta da Receita não respondeu agora. Preencha à mão ou tente de novo." };
  }
}

// Reserva: a mesma consulta pelo CNPJ.ws (traz também a inscrição estadual).
async function pelaCnpjWs(c: string): Promise<{ ok: true; dados: DadosCnpj } | null> {
  try {
    const r = await fetch(`https://publica.cnpj.ws/cnpj/${c}`, { signal: AbortSignal.timeout(12000), headers: CABECALHO });
    if (!r.ok) return null;
    type Est = { tipo_logradouro?: string; logradouro?: string; numero?: string; complemento?: string; bairro?: string; cep?: string; ddd1?: string; telefone1?: string; email?: string; nome_fantasia?: string; situacao_cadastral?: string; cidade?: { nome?: string; ibge_id?: number }; estado?: { sigla?: string }; inscricoes_estaduais?: { inscricao_estadual?: string; ativo?: boolean; estado?: { sigla?: string } }[] };
    const j = (await r.json()) as { razao_social?: string; estabelecimento?: Est };
    const e = j.estabelecimento ?? {};
    const uf = String(e.estado?.sigla ?? "").toUpperCase();
    const ie = (e.inscricoes_estaduais ?? []).find((x) => x.ativo && x.estado?.sigla === uf) ?? (e.inscricoes_estaduais ?? []).find((x) => x.ativo);
    const tel = soDigitos(`${e.ddd1 ?? ""}${e.telefone1 ?? ""}`);
    return {
      ok: true,
      dados: {
        cnpj: c,
        razao_social: String(j.razao_social ?? "").trim(),
        nome_fantasia: String(e.nome_fantasia ?? "").trim() || null,
        logradouro: [e.tipo_logradouro, e.logradouro].filter(Boolean).join(" ").trim(),
        numero: String(e.numero ?? "").trim() || "S/N",
        complemento: String(e.complemento ?? "").trim() || null,
        bairro: String(e.bairro ?? "").trim(),
        municipio: String(e.cidade?.nome ?? "").trim(),
        uf,
        cep: soDigitos(e.cep),
        cod_municipio: e.cidade?.ibge_id != null ? String(e.cidade.ibge_id) : null,
        telefone: tel.length >= 10 ? tel : null,
        email: String(e.email ?? "").trim().toLowerCase() || null,
        situacao: String(e.situacao_cadastral ?? "").trim() || null,
        ie: ie?.inscricao_estadual ? soDigitos(ie.inscricao_estadual) : null,
      },
    };
  } catch {
    return null;
  }
}
