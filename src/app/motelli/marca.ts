// A identidade do site da marca Motelli, num lugar só, pra as páginas (e as
// próximas) desenharem igual. Tons de cozinha: papel cru, tinta e manjericão.
//
// Fica fora do layout.tsx de propósito: página e layout do App Router só podem
// exportar o que o Next espera (componente, metadata…).
export const CORES = {
  papel: "#f5f3ec",
  tinta: "#1c1d1a",
  suave: "#5f625a",
  linha: "#d9d5c8",
  manjericao: "#3b6d4f",
  manjericaoEscuro: "#2c5340",
};

// contato@motelli.com.br existe desde 01/10/2026 (redirecionador ImprovMX →
// Gmail da VTM): a Play Console exigiu um e-mail no domínio do site pra conta
// da organização. É o mesmo e-mail da ficha da loja e da política.
export const CONTATO_EMAIL = "contato@motelli.com.br";

export const FONTE_TITULO = "var(--font-space-grotesk), system-ui, sans-serif";
export const FONTE_TEXTO = "var(--font-instrument-sans), system-ui, sans-serif";
