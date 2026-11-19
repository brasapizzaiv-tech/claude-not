import { createClient } from "@/lib/supabase/server";
import { paletaDaEmpresa, sobre } from "@/lib/paleta";
import { empresaAtualId } from "@/lib/empresa";
import { createAdminClient } from "@/lib/supabase/admin";

// A cor da empresa (Etapa 3 do design).
//
// Até aqui o laranja da Brasa estava escrito no globals.css. Agora ele mora no
// cadastro da empresa, e o CSS deriva a escala inteira dele. Outro restaurante
// entra com a cara dele sem ninguém tocar em código.
//
// Só três cores são guardadas. Tudo o mais é calculado:
//   - a escala de claro a escuro, pelo CSS (color-mix no globals.css)
//   - a cor do TEXTO por cima da primária, aqui embaixo, porque depende de
//     medir o brilho e CSS não faz isso.

export type Marca = {
  primaria: string;
  escuro: string;
  sobreEscuro: string;
  sobrePrimaria: string;
  logoUrl: string;
  /** Nome completo do cadastro ("Brasa Pizzaria e Restaurante"). */
  nome: string;
  /** O que aparece nas telas e mensagens ("Brasa", "Beeis"). */
  nomeCurto: string;
};

export const MARCA_PADRAO: Marca = {
  primaria: "#e57a2c",
  escuro: "#1c120c",
  sobreEscuro: "#fff6ec",
  sobrePrimaria: "#1c120c",
  logoUrl: "/logo-brasa.png",
  nome: "Motelli",
  nomeCurto: "Motelli",
};

const ehCor = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);

export { sobre };

/** Lê as cores da empresa do contexto. Cai no padrão se algo faltar. */
export async function lerMarca(): Promise<Marca> {
  try {
    const supabase = await createClient();
    // A empresa DESTE acesso (login, link da equipe, endereço). A leitura de
    // `empresas` é aberta a todos: sem o filtro, com dois restaurantes no banco
    // vinha a cor e o nome do primeiro da lista.
    const id = await empresaAtualId();
    type Linha = {
      nome: string | null; nome_curto?: string | null; cor_primaria: string | null;
      cor_escuro: string | null; cor_sobre_escuro: string | null; logo_url: string | null;
    };
    const ler = async (campos: string) => {
      let q = supabase.from("empresas").select(campos);
      q = id ? q.eq("id", id) : q.order("criado_em");
      return q.limit(1).maybeSingle<Linha>();
    };
    const base = "nome, cor_primaria, cor_escuro, cor_sobre_escuro, logo_url";
    const primeira = await ler(`${base}, nome_curto`);
    // Antes da migration 0322 a coluna nome_curto não existe: lê sem ela.
    const data = primeira.error ? (await ler(base)).data : primeira.data;
    if (!data) return MARCA_PADRAO;
    // Só no computador de desenvolvimento: testar uma cor nova sem mexer no
    // cadastro (que é o mesmo banco da produção). Em produção não existe.
    if (process.env.NODE_ENV !== "production" && process.env.MARCA_PRIMARIA_DEV) {
      data.cor_primaria = process.env.MARCA_PRIMARIA_DEV;
      data.cor_escuro = process.env.MARCA_ESCURO_DEV || data.cor_escuro;
      data.cor_sobre_escuro = process.env.MARCA_SOBRE_ESCURO_DEV || data.cor_sobre_escuro;
    }
    const primaria = ehCor(data.cor_primaria) ? data.cor_primaria : MARCA_PADRAO.primaria;
    return {
      primaria,
      escuro: ehCor(data.cor_escuro) ? data.cor_escuro : MARCA_PADRAO.escuro,
      sobreEscuro: ehCor(data.cor_sobre_escuro) ? data.cor_sobre_escuro : MARCA_PADRAO.sobreEscuro,
      sobrePrimaria: sobre(primaria, ehCor(data.cor_escuro) ? data.cor_escuro : MARCA_PADRAO.escuro),
      logoUrl: (data.logo_url as string | null) || MARCA_PADRAO.logoUrl,
      nome: (data.nome as string | null)?.trim() || MARCA_PADRAO.nome,
      nomeCurto: (data.nome_curto ?? "").trim() || data.nome?.trim() || MARCA_PADRAO.nomeCurto,
    };
  } catch {
    // Banco fora do ar não pode deixar a tela sem cor nenhuma.
    return MARCA_PADRAO;
  }
}

/**
 * O CSS que põe as cores da empresa em pé.
 *
 * As quatro cores do cadastro e a paleta inteira girada pro tom da empresa
 * (src/lib/paleta.ts), nos dois temas. Vai num <style> no começo da página,
 * então já vale na primeira pintura — sem trocar de cor na frente de ninguém.
 * O escuro fica dentro de @media screen, como no globals.css: papel é claro.
 */
export function cssDaMarca(m: Marca): string {
  const { clara, escura } = paletaDaEmpresa(m.primaria);
  const vars = (t: Record<string, string>) => Object.entries(t).map(([k, v]) => `--${k}:${v};`).join("");
  return (
    `:root{` +
    `--marca-primaria:${m.primaria};` +
    `--marca-escuro:${m.escuro};` +
    `--marca-sobre-escuro:${m.sobreEscuro};` +
    `--marca-sobre-primaria:${m.sobrePrimaria};` +
    vars(clara) +
    `}` +
    `@media screen{[data-tema="escuro"]{${vars(escura)}}}`
  );
}

/**
 * O nome curto de uma empresa já conhecida (pela chave da TV, pelo token do
 * link). Pras telas sem login em que "a empresa deste acesso" não dá pra
 * saber pelo endereço. Cai no nome completo e, sem nada, em "Motelli".
 */
export async function nomeCurtoDaEmpresa(empresaId: string | null | undefined): Promise<string> {
  if (!empresaId) return MARCA_PADRAO.nomeCurto;
  try {
    const admin = createAdminClient();
    type Linha = { nome: string | null; nome_curto?: string | null };
    const primeira = await admin.from("empresas").select("nome, nome_curto").eq("id", empresaId).maybeSingle<Linha>();
    // Antes da migration 0322 a coluna nome_curto não existe: lê sem ela.
    const data = primeira.error ? (await admin.from("empresas").select("nome").eq("id", empresaId).maybeSingle<Linha>()).data : primeira.data;
    return (data?.nome_curto ?? "").trim() || data?.nome?.trim() || MARCA_PADRAO.nomeCurto;
  } catch {
    return MARCA_PADRAO.nomeCurto;
  }
}
