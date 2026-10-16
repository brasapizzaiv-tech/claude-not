// Paleta do sistema (layout novo, out/2026 — protótipo em docs/referencia-layout).
//
// A tabela abaixo é a paleta APROVADA, escrita com o laranja do Brasa
// (#E57A2C). Ela vale pra qualquer empresa: quando a cor cadastrada é outra,
// cada valor gira pro tom dela (mesma luz, mesma saturação relativa), então um
// restaurante azul ganha creme azulado em vez de creme laranja. Com o laranja
// do Brasa o giro é zero e sai exatamente a tabela.
//
// Quem usa: src/lib/marca.ts (CSS da empresa, no começo da página) e a prévia
// da tela Aparência. O globals.css repete estes mesmos valores como reserva,
// pra página ter cor mesmo antes do CSS da empresa.

export const PRIMARIA_BASE = "#e57a2c";

/** Nome do token (sem o "--") → valor no tema claro. */
export const PALETA_CLARA: Record<string, string> = {
  "painel-fundo": "#fff8ef",          // fundo da página
  "painel-cartao": "#ffffff",         // superfície (cartão)
  "superficie": "#ffffff",
  "superficie-suave": "#fbf2e8",      // superfície 2: blocos internos, mesa livre
  "destaque": "#ffe7d1",              // pêssego
  "borda": "#f1e2d2",                 // linha / contorno
  "borda-forte": "#e3cdb8",           // contorno de campo
  "texto": "#1c120c",
  "texto-suave": "#6e635b",           // texto médio
  "texto-fraco": "#7a6a5d",           // rótulos (o protótipo dizia #8A7A6C: 3,9:1 no creme, abaixo do mínimo)
  "texto-marca": "#b44d14",           // texto laranja: link, destaque
  "texto-marca-pilula": "#a3440f",    // texto laranja sobre o pêssego (o #B44D14 dá 4,4:1 ali)
  "ok-fundo": "#d9f2e2",
  "ok-texto": "#1e7a43",
  "urgente-fundo": "#fde1da",
  "urgente-texto": "#b42a18",
  "urgente-solido": "#d63a22",
  "info-fundo": "#e3ecfb",
  "info-texto": "#2b58a8",
  "painel-foco-fundo": "var(--marca-escuro)", // cartão de foco: grafite da empresa
  "painel-foco-texto": "#fff6ec",
  "painel-foco-suave": "#c9b8a8",     // texto de apoio dentro do cartão de foco
  "painel-foco-rotulo": "#ffb25e",    // rótulo laranja no cartão de foco
  "painel-foco-linha": "#4a3e36",     // contorno do botão secundário no foco
  "sombra-cartao": "0 2px 4px rgba(120, 60, 20, 0.05), 0 10px 24px rgba(120, 60, 20, 0.08)",
  "sombra-controle": "0 1px 3px rgba(120, 60, 20, 0.05), 0 6px 18px rgba(120, 60, 20, 0.06)",
  "sombra-foco-cartao": "0 14px 30px rgba(28, 18, 12, 0.24)",
  "brilho-primaria": "0 6px 16px rgba(229, 122, 44, 0.32)",
};

export const PALETA_ESCURA: Record<string, string> = {
  "painel-fundo": "#140d09",
  "painel-cartao": "#1f1611",
  "superficie": "#1f1611",
  "superficie-suave": "#2a1e17",
  "destaque": "rgba(229, 122, 44, 0.16)",
  "borda": "#3a2a20",
  "borda-forte": "#4a3a2e",
  "texto": "#fff6ec",
  "texto-suave": "#b8a595",
  "texto-fraco": "#9c8878",
  "texto-marca": "#ffb25e",
  "texto-marca-pilula": "#ffb25e",
  "ok-fundo": "rgba(63, 217, 140, 0.14)",
  "ok-texto": "#5fe3a1",
  "urgente-fundo": "rgba(255, 116, 72, 0.16)",
  "urgente-texto": "#ff8a66",
  "urgente-solido": "#ff7448",
  "info-fundo": "rgba(98, 150, 255, 0.16)",
  "info-texto": "#8fb4ff",
  "painel-foco-fundo": "#fff6ec",          // no escuro o foco inverte: creme
  "painel-foco-texto": "#1c120c",
  "painel-foco-suave": "#6e635b",
  "painel-foco-rotulo": "#b44d14",
  "painel-foco-linha": "#d9c7b5",
  "sombra-cartao": "inset 0 0 0 1px #2a1e17, 0 10px 26px rgba(0, 0, 0, 0.35)",
  "sombra-controle": "inset 0 0 0 1px #3a2a20",
  "sombra-foco-cartao": "0 14px 30px rgba(0, 0, 0, 0.4)",
  "brilho-primaria": "0 6px 16px rgba(229, 122, 44, 0.28)",
};

// Estado (verde, vermelho, azul) NÃO gira com a marca: vermelho tem que ser
// vermelho em qualquer empresa. Só os neutros quentes e o laranja giram.
const FIXOS = new Set(["ok-fundo", "ok-texto", "urgente-fundo", "urgente-texto", "urgente-solido", "info-fundo", "info-texto"]);

// ---------------------------------------------------------------------------
// Conversões de cor (HSL basta: o giro preserva luz e saturação relativa).
// ---------------------------------------------------------------------------
type Hsl = { h: number; s: number; l: number };

function rgbParaHsl(r: number, g: number, b: number): Hsl {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s, l };
}

function hslParaRgb({ h, s, l }: Hsl): [number, number, number] {
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)].map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255)) as [number, number, number];
}

const hexParaRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgbParaHex = (r: number, g: number, b: number) => `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;

/** Gira uma cor do tom do Brasa pro tom da empresa. */
function girar(rgb: [number, number, number], dh: number, fs: number): [number, number, number] {
  const c = rgbParaHsl(...rgb);
  if (c.s === 0) return rgb;
  return hslParaRgb({ h: (c.h + dh + 360) % 360, s: Math.min(1, c.s * fs), l: c.l });
}

/** Valor (hex, rgba ou sombra com cores dentro) girado. */
function girarValor(valor: string, dh: number, fs: number): string {
  return valor
    .replace(/#[0-9a-f]{6}\b/gi, (hex) => rgbParaHex(...girar(hexParaRgb(hex), dh, fs)))
    .replace(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/g, (_, r, g, b, a) => {
      const [nr, ng, nb] = girar([Number(r), Number(g), Number(b)], dh, fs);
      return `rgba(${nr}, ${ng}, ${nb}, ${a})`;
    });
}

/** A paleta inteira no tom da cor da empresa. */
export function paletaDaEmpresa(primaria: string): { clara: Record<string, string>; escura: Record<string, string> } {
  const base = rgbParaHsl(...hexParaRgb(PRIMARIA_BASE));
  const alvo = rgbParaHsl(...hexParaRgb(/^#[0-9a-f]{6}$/i.test(primaria) ? primaria : PRIMARIA_BASE));
  const dh = alvo.h - base.h;
  // Cor da empresa quase cinza → neutros quase cinza também.
  const fs = base.s > 0 ? Math.min(1.2, alvo.s / base.s) : 1;
  const igual = Math.abs(dh) < 0.01 && Math.abs(fs - 1) < 0.001;
  const conv = (t: Record<string, string>) =>
    Object.fromEntries(Object.entries(t).map(([k, v]) => [k, igual || FIXOS.has(k) ? v : girarValor(v, dh, fs)]));
  return { clara: conv(PALETA_CLARA), escura: conv(PALETA_ESCURA) };
}

/** Contraste WCAG entre duas cores hex. */
export function contraste(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = hexParaRgb(hex).map((c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/**
 * A letra que vai POR CIMA desta cor: branca ou o grafite da empresa — a que
 * der MAIS contraste. (Layout novo, out/2026: antes mantinha o branco enquanto
 * desse 3:1; o laranja novo com branco fica em 3,3:1 e o protótipo pede letra
 * grafite, 6,3:1. Uma cor escura — azul-marinho, vinho — continua com branco.)
 */
export function sobre(cor: string, escuro = "#1c120c"): string {
  return contraste(cor, escuro) >= contraste(cor, "#ffffff") ? escuro : "#ffffff";
}
