import { createClient } from "@/lib/supabase/server";

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
};

export const MARCA_PADRAO: Marca = {
  primaria: "#c78340",
  escuro: "#211915",
  sobreEscuro: "#e8ded5",
  sobrePrimaria: "#ffffff",
  logoUrl: "/logo-brasa.png",
};

const ehCor = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);

/**
 * A letra que vai POR CIMA desta cor: branca ou quase preta.
 *
 * Mantém o branco enquanto ele der pelo menos 3:1 de contraste, que é o piso
 * da WCAG pra texto em negrito e para elemento de interface — é o caso dos
 * rótulos de botão. Só quando o branco não alcança isso (uma cor clara, tipo
 * um amarelo) é que a letra vira escura sozinha.
 *
 * Por que não "o que der mais contraste": no laranja da Brasa o preto ganha
 * na conta (6,7 contra 3,1), e adotá-lo viraria a letra de todos os botões do
 * sistema de branca pra preta — uma mudança de cara que ninguém pediu. Este
 * critério protege quem escolher uma cor clara sem mexer em quem já está bom.
 */
export function sobre(cor: string): string {
  const n = parseInt(cor.slice(1), 16);
  const canais = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const brilho = 0.2126 * canais[0] + 0.7152 * canais[1] + 0.0722 * canais[2];
  const contraBranco = 1.05 / (brilho + 0.05); // 0.05 é a constante da fórmula
  return contraBranco >= 3 ? "#ffffff" : "#18181b";
}

/** Lê as cores da empresa do contexto. Cai no padrão se algo faltar. */
export async function lerMarca(): Promise<Marca> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("empresas")
      .select("cor_primaria, cor_escuro, cor_sobre_escuro, logo_url")
      .limit(1)
      .maybeSingle();
    if (!data) return MARCA_PADRAO;
    const primaria = ehCor(data.cor_primaria) ? data.cor_primaria : MARCA_PADRAO.primaria;
    return {
      primaria,
      escuro: ehCor(data.cor_escuro) ? data.cor_escuro : MARCA_PADRAO.escuro,
      sobreEscuro: ehCor(data.cor_sobre_escuro) ? data.cor_sobre_escuro : MARCA_PADRAO.sobreEscuro,
      sobrePrimaria: sobre(primaria),
      logoUrl: (data.logo_url as string | null) || MARCA_PADRAO.logoUrl,
    };
  } catch {
    // Banco fora do ar não pode deixar a tela sem cor nenhuma.
    return MARCA_PADRAO;
  }
}

/**
 * O CSS que põe as cores da empresa em pé.
 *
 * São só quatro linhas porque o resto deriva delas. Vai num <style> no começo
 * da página, então já vale na primeira pintura — sem trocar de cor na frente
 * de quem está olhando.
 */
export function cssDaMarca(m: Marca): string {
  return (
    `:root{` +
    `--marca-primaria:${m.primaria};` +
    `--marca-escuro:${m.escuro};` +
    `--marca-sobre-escuro:${m.sobreEscuro};` +
    `--marca-sobre-primaria:${m.sobrePrimaria};` +
    `}`
  );
}
