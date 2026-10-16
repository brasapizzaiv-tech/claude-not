import { createClient } from "@/lib/supabase/server";
import { paletaDaEmpresa, sobre } from "@/lib/paleta";

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
  nome: string;
};

export const MARCA_PADRAO: Marca = {
  primaria: "#e57a2c",
  escuro: "#1c120c",
  sobreEscuro: "#fff6ec",
  sobrePrimaria: "#1c120c",
  logoUrl: "/logo-brasa.png",
  nome: "Brasa",
};

const ehCor = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);

export { sobre };

/** Lê as cores da empresa do contexto. Cai no padrão se algo faltar. */
export async function lerMarca(): Promise<Marca> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("empresas")
      .select("nome, cor_primaria, cor_escuro, cor_sobre_escuro, logo_url")
      .limit(1)
      .maybeSingle();
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
