import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Sans, Space_Grotesk } from "next/font/google";
import "./globals.css";

// As letras do sistema.
//
// O Next BAIXA a fonte na hora de publicar e serve do nosso próprio endereço —
// não sai pedindo nada pro Google quando a tela abre. Por isso o quiosque da
// balança e qualquer tela sem internet continuam funcionando igual.
//
// Instrument Sans: interface e texto corrido.
// Space Grotesk: número, valor e título (os dígitos se distinguem melhor, o
//                que ajuda a bater valor de caixa).
// Geist: continua carregada só pra dar meia-volta fácil se você não gostar do
//        par novo. Quando decidir, a gente apaga esta e fica mais leve.
const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sistema de Cotação",
  description: "Compras, cotação de fornecedores, conferência e financeiro.",
  manifest: "/manifest.webmanifest",
};

// Decide claro ou escuro ANTES da página pintar.
//
// Roda direto no <head>, enquanto o navegador ainda lê o HTML, então a tela já
// nasce na cor certa — sem aquele branco piscando antes de escurecer. Lê o
// cookie que a tela de Aparência grava; se a pessoa escolheu "sistema" (ou
// nunca escolheu nada, que é o caso de todo mundo hoje), segue o ajuste do
// aparelho, que era o comportamento de antes.
const SCRIPT_TEMA = `(function(){try{
var m=document.cookie.match(/(?:^|; )tema=([^;]*)/);
var t=m?decodeURIComponent(m[1]):"sistema";
if(t!=="claro"&&t!=="escuro"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"escuro":"claro";}
document.documentElement.setAttribute("data-tema",t);
}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      data-tema="claro"
      suppressHydrationWarning
      className={`${instrumentSans.variable} ${spaceGrotesk.variable} ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
