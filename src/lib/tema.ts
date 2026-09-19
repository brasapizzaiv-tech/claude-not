// Aparência do painel: claro, escuro ou seguindo o aparelho.
//
// A escolha mora no perfil da pessoa (coluna `tema`, migration 0181), pra valer
// em qualquer computador ou celular onde ela entrar. O navegador guarda uma
// cópia num cookie só pra tela já nascer na cor certa: quem lê esse cookie é o
// script do src/app/layout.tsx, antes da página pintar.
//
// Sem imports de servidor — roda dos dois lados.

export type Tema = "claro" | "escuro" | "sistema";

export const TEMA_PADRAO: Tema = "sistema";

export const TEMAS: { valor: Tema; label: string; icone: string; ajuda: string }[] = [
  { valor: "claro", label: "Claro", icone: "☀️", ajuda: "Fundo branco o dia todo." },
  { valor: "escuro", label: "Escuro", icone: "🌙", ajuda: "Fundo grafite, cansa menos à noite." },
  { valor: "sistema", label: "Do aparelho", icone: "💻", ajuda: "Acompanha o ajuste do celular ou do computador." },
];

export const COOKIE_TEMA = "tema";

export function ehTema(v: unknown): v is Tema {
  return v === "claro" || v === "escuro" || v === "sistema";
}
