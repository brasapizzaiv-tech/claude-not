// Ficha do funcionário (migration 0257): os campos de cada aba, como no
// "Editar Funcionário" do RHiD. Sem import: a tela e o servidor usam igual.

export type CampoFicha = {
  k: string;
  rotulo: string;
  tipo?: "texto" | "data" | "opcoes" | "longo";
  opcoes?: string[];
  dica?: string;
  /** Só números (CPF, PIS, CEP...). */
  numeros?: boolean;
  largura?: "toda" | "meia";
};

export const CNH_CATEGORIAS = ["A", "B", "AB", "C", "D", "E", "AC", "AD", "AE"];
export const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];
export const GENEROS = ["Feminino", "Masculino", "Outro", "Prefere não dizer"];
export const TIPOS_SANGUE = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
export const TIPOS_DOCUMENTO = ["Contrato de trabalho", "Exame admissional", "Exame periódico", "Exame demissional", "Documento pessoal", "CNH", "Termo", "Advertência", "Outro"];

/** Aba Informações gerais (além de departamento, cargo e superior, que são listas). */
export const CAMPOS_GERAIS: CampoFicha[] = [
  { k: "matricula", rotulo: "Matrícula" },
  { k: "cpf", rotulo: "CPF", numeros: true },
  { k: "pis", rotulo: "PIS", numeros: true, dica: "Quem foi cadastrado no relógio pelo PIS bate com esse número." },
  { k: "admissao", rotulo: "Data da admissão", tipo: "data", dica: "Antes dela o ponto não conta falta." },
  { k: "numero_folha", rotulo: "Número da folha" },
  { k: "ctps", rotulo: "CTPS" },
  { k: "obs_cartao_ponto", rotulo: "Observações para o cartão de ponto", tipo: "longo", largura: "toda", dica: "Sai impresso no espelho de ponto." },
];

/** Aba Dados pessoais. */
export const CAMPOS_PESSOAIS: CampoFicha[] = [
  { k: "rg", rotulo: "RG" },
  { k: "nome_social", rotulo: "Nome social" },
  { k: "cnh", rotulo: "CNH", numeros: true },
  { k: "cnh_categoria", rotulo: "Categoria da CNH", tipo: "opcoes", opcoes: CNH_CATEGORIAS },
  { k: "cnh_validade", rotulo: "Vencimento da CNH", tipo: "data" },
  { k: "cep", rotulo: "CEP", numeros: true },
  { k: "endereco", rotulo: "Endereço", largura: "toda" },
  { k: "endereco_numero", rotulo: "Número" },
  { k: "bairro", rotulo: "Bairro" },
  { k: "cidade", rotulo: "Cidade" },
  { k: "uf", rotulo: "UF", tipo: "opcoes", opcoes: UFS },
  { k: "telefone", rotulo: "Telefone" },
  { k: "telefone_emergencia", rotulo: "Telefone de emergência" },
  { k: "nome_pai", rotulo: "Nome do pai" },
  { k: "nome_mae", rotulo: "Nome da mãe" },
  { k: "genero", rotulo: "Gênero", tipo: "opcoes", opcoes: GENEROS },
  { k: "tipo_sanguineo", rotulo: "Tipo sanguíneo", tipo: "opcoes", opcoes: TIPOS_SANGUE },
];

/** Colunas que a ficha pode gravar (texto livre, data ou id de lista). */
export const COLUNAS_FICHA = new Set([
  ...CAMPOS_GERAIS.map((c) => c.k), ...CAMPOS_PESSOAIS.map((c) => c.k),
  "departamento_id", "superior_id", "nascimento",
]);
export const COLUNAS_DATA = new Set([...CAMPOS_GERAIS, ...CAMPOS_PESSOAIS].filter((c) => c.tipo === "data").map((c) => c.k));
export const COLUNAS_NUMEROS = new Set([...CAMPOS_GERAIS, ...CAMPOS_PESSOAIS].filter((c) => c.numeros).map((c) => c.k));

/** Dias até a validade (negativo = vencido). */
export function diasAte(validade: string, hoje: string) {
  return Math.round((Date.parse(`${validade}T12:00:00Z`) - Date.parse(`${hoje}T12:00:00Z`)) / 86400000);
}
