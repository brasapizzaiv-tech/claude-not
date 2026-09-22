// Quadro de pedidos do rodízio: tipos e regras compartilhadas entre o app do
// garçom, a TV da cozinha e o tablet. Sem dependência de servidor (roda no
// navegador também).

export type StatusRodizio = "pendente" | "forno" | "pronto" | "cancelado";
export type FracaoRodizio = "inteira" | "meia" | "quarto";
export type TipoSabor = "salgada" | "doce";

export type PedidoRodizio = {
  id: string;
  mesa: number;
  sabor: string;
  tipo: TipoSabor;
  fracao: FracaoRodizio;
  quantidade: number;
  observacao: string | null;
  status: StatusRodizio;
  criado_em: string;
  forno_em: string | null;
  pronto_em: string | null;
  garcom: string | null;
};

export const MESAS_MAX = 46;
export const ESPERA_ALERTA_MIN = 8;      // pendente há mais que isso fica vermelho
export const PRONTO_SOME_SEG = 90;       // "pronto" some da TV depois disso
export const CARDS_POR_COLUNA = 7;       // cabe na TV sem rolar (cartão medido em vh)

export const FRACAO_ROTULO: Record<FracaoRodizio, string> = {
  inteira: "INTEIRA",
  meia: "MEIA",
  quarto: "1/4",
};

// Cores por status, assentadas no grafite da marca (o fundo da TV deixou de
// ser preto puro). O status se lê de três jeitos ao mesmo tempo — a tarja
// grossa da esquerda, o tom do cartão e a palavra escrita — porque na cozinha
// a TV é vista de longe e de lado.
export const STATUS_COR: Record<StatusRodizio, { fundo: string; borda: string; texto: string; rotulo: string }> = {
  pendente: { fundo: "#3a2712", borda: "#C78340", texto: "#eac79c", rotulo: "PENDENTE" },
  forno:    { fundo: "#1c2c3d", borda: "#6aa9e0", texto: "#bcd9f2", rotulo: "NO FORNO" },
  pronto:   { fundo: "#1c2e20", borda: "#7ec98a", texto: "#c3e6c9", rotulo: "PRONTO" },
  cancelado:{ fundo: "#2b211b", borda: "#57463b", texto: "#9b8878", rotulo: "CANCELADO" },
};

// Minutos desde uma data.
export function minutosDesde(iso: string, agora = Date.now()): number {
  return Math.max(0, Math.floor((agora - new Date(iso).getTime()) / 60000));
}

// "agora" · "há 1 min" · "há 12 min"
export function tempoEspera(iso: string, agora = Date.now()): string {
  const m = minutosDesde(iso, agora);
  if (m < 1) return "agora";
  return `há ${m} min`;
}

// O que a TV/tablet mostram: pendentes e no forno sempre; prontos só por um
// tempo (pra cozinha ver que saiu). Mais antigo em cima.
export function filaVisivel(pedidos: PedidoRodizio[], agora = Date.now()): PedidoRodizio[] {
  return pedidos
    .filter((p) => {
      if (p.status === "pendente" || p.status === "forno") return true;
      if (p.status === "pronto" && p.pronto_em) return agora - new Date(p.pronto_em).getTime() < PRONTO_SOME_SEG * 1000;
      return false;
    })
    .sort((a, b) => a.criado_em.localeCompare(b.criado_em));
}

export function separarColunas(fila: PedidoRodizio[]) {
  return {
    salgadas: fila.filter((p) => p.tipo !== "doce"),
    doces: fila.filter((p) => p.tipo === "doce"),
  };
}

// Normaliza texto pra busca (sem acento, minúsculo).
export const normalizar = (s: string) =>
  String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
