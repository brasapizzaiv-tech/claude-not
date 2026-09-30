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

// Por enquanto é o Gmail da VTM (decisão do Rafael em 30/09/2026): ainda não
// existe caixa de entrada no domínio motelli.com.br. Quando existir, troca aqui
// e o site, a política e a ficha da Play passam a apontar pra ela.
export const CONTATO_EMAIL = "vtmsstore@gmail.com";

export const FONTE_TITULO = "var(--font-space-grotesk), system-ui, sans-serif";
export const FONTE_TEXTO = "var(--font-instrument-sans), system-ui, sans-serif";
