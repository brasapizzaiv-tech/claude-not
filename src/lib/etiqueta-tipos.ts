// Tipos de etiqueta e como cada um aparece impresso (compartilhado entre o
// PDF no servidor e a pré-visualização no navegador — sem dependências de Node).
export type TipoEtiqueta = "manipulacao" | "fracionamento" | "descongelamento" | "amostra" | "livre";

export const TIPOS: { key: TipoEtiqueta; titulo: string; icone: string; cabecalho: string; dataLabel: string; dica: string }[] = [
  { key: "manipulacao", titulo: "Manipulação", icone: "🔪", cabecalho: "MANIPULAÇÃO", dataLabel: "Manip.", dica: "Preparo feito na cozinha." },
  { key: "fracionamento", titulo: "Fracionamento", icone: "📦", cabecalho: "FRACIONAMENTO", dataLabel: "Fracion.", dica: "Embalagem aberta / porcionada." },
  { key: "descongelamento", titulo: "Descongelamento", icone: "❄️", cabecalho: "DESCONGELAMENTO", dataLabel: "Início", dica: "Começou a descongelar agora; validade = prazo pra usar." },
  { key: "amostra", titulo: "Amostra", icone: "🧪", cabecalho: "AMOSTRA", dataLabel: "Coleta", dica: "Amostra guardada por 72h." },
  { key: "livre", titulo: "Livre", icone: "✏️", cabecalho: "", dataLabel: "Emitida", dica: "Título + texto à sua escolha." },
];

export const tipoInfo = (t?: string | null) => TIPOS.find((x) => x.key === t) ?? TIPOS[0];
export const tipoValido = (t?: string | null): TipoEtiqueta => (TIPOS.some((x) => x.key === t) ? (t as TipoEtiqueta) : "manipulacao");

// Dados que a etiqueta mostra (PDF e pré-visualização usam o mesmo formato).
export type EtiquetaDados = {
  id: string;
  numero: number;
  produto: string;
  colaborador: string | null;
  manipuladoEm: string;
  validade: string | null;
  conservacao: string | null;
  quantidade: number | null;
  unidade: string | null;
  tipo?: string | null;
  categoria?: string | null;
  marca?: string | null;
  lote?: string | null;
  validadeOriginal?: string | null;
  sif?: string | null;
  texto?: string | null;
};

// Formato da etiqueta, configurável por impressora na Central de Impressões.
export type EtiquetaConfig = {
  largura?: number; // mm
  altura?: number;  // mm
  margem?: number;  // mm
  escala?: number;  // % do tamanho da letra (100 = normal)
  qr?: boolean;     // imprime o QR code
  barraValidade?: boolean; // VALIDADE em barra preta (estilo KALI)
  categoria?: boolean;     // mostra a categoria do item
  empresa?: string | null; // rodapé: razão social / CNPJ
  // Calibração da impressora: desloca TODO o desenho (mm). Negativo = sobe / esquerda.
  deslocX?: number;
  deslocY?: number;
};

export const CONS_LABEL: Record<string, string> = { congelado: "CONGELADO", resfriado: "RESFRIADO", ambiente: "AMBIENTE" };

export function dataBRcurta(iso: string) {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

// Linhas pequenas com os campos opcionais preenchidos.
export function linhasExtras(d: Pick<EtiquetaDados, "marca" | "lote" | "sif" | "validadeOriginal">): string[] {
  const out: string[] = [];
  if (d.marca) out.push(`Marca: ${d.marca}`);
  if (d.lote) out.push(`Lote: ${d.lote}`);
  if (d.sif) out.push(`SIF: ${d.sif}`);
  if (d.validadeOriginal) out.push(`Val. original: ${dataBRcurta(d.validadeOriginal)}`);
  return out;
}
