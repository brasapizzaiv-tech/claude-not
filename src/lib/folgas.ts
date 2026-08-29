// Regras e constantes do sistema de folgas (compartilhado entre a gestão e o
// app do funcionário). Sem React nem Supabase: só tipos e lógica pura.

export const GRUPOS = {
  almoco: { nome: "Almoço (buffet)", curto: "Alm", cor: "#a78b6a" },
  entregaDia: { nome: "Entregadores do dia", curto: "EntD", cor: "#c39a5f" },
  cozinha: { nome: "Cozinha pizzaria", curto: "Coz", cor: "#c07344" },
  salao: { nome: "Salão pizzaria", curto: "Sal", cor: "#6f88ad" },
  entregaNoite: { nome: "Entregadores da noite", curto: "EntN", cor: "#8a9a6a" },
} as const;

export type GrupoKey = keyof typeof GRUPOS;
export const GRUPO_KEYS = Object.keys(GRUPOS) as GrupoKey[];

export const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
export const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
export const TURNO: Record<string, string> = {
  almoco: "Dia", entregaDia: "Dia", cozinha: "Noite", salao: "Noite", entregaNoite: "Noite",
};
export const DIAS_ANTECEDENCIA = 15;

export type Funcionario = {
  id: number;
  nome: string;
  grupo: GrupoKey;
  vinculo: "CLT" | "Freelance";
  funcao: string | null;
  dias: number[] | null;
  grupo2: GrupoKey | null;
  dias2: number[] | null;
  gerente: boolean;
  ativo: boolean;
  token: string | null;
  pin?: string | null;
};

export type Pedido = {
  id: number;
  funcionario_id: number;
  data: string;
  motivo: string | null;
  status: "Pendente" | "Aprovado" | "Negado";
  motivo_negativa: string | null;
  origem: "app" | "gestao";
  grupo_alvo: string | null;
};

// limites[grupo][dia_semana] = limite | null
export type Limites = Record<string, Record<number, number | null>>;
// ajustes[data][grupo] = limite
export type Ajustes = Record<string, Record<string, number>>;
// bloqueios[data] = motivo
export type Bloqueios = Record<string, string>;

// ---- datas (trabalham com "YYYY-MM-DD" para não depender de fuso) ----
export const iso = (a: number, m: number, d: number) =>
  `${a}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
export const dow = (s: string) => {
  const [a, m, d] = s.split("-").map(Number);
  return new Date(a, m - 1, d).getDay();
};
export const fmtData = (s: string) => {
  const [a, m, d] = s.split("-").map(Number);
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${a}`;
};
export const difDias = (a: string, b: string) => {
  const [x1, y1, z1] = a.split("-").map(Number);
  const [x2, y2, z2] = b.split("-").map(Number);
  return Math.round((+new Date(x2, y2 - 1, z2) - +new Date(x1, y1 - 1, z1)) / 86400000);
};

// ---- regras ----
export const gruposDe = (f: Funcionario): GrupoKey[] =>
  [f.grupo, f.grupo2].filter(Boolean) as GrupoKey[];
export const diasDe = (f: Funcionario, g: GrupoKey) => (g === f.grupo2 ? f.dias2 : f.dias);
export const diasTodos = (f: Funcionario) =>
  [...new Set(gruposDe(f).flatMap((g) => diasDe(f, g) || []))].sort();

// grupos que o pedido realmente afeta
export const alvosDe = (p: Pedido, byId: Map<number, Funcionario>): GrupoKey[] => {
  const f = byId.get(p.funcionario_id);
  if (!f) return [];
  return p.grupo_alvo ? [p.grupo_alvo as GrupoKey] : gruposDe(f);
};

export const limiteDe = (
  data: string, grupo: string, limites: Limites, ajustes: Ajustes,
): number | null | undefined => {
  const a = ajustes[data];
  if (a && a[grupo] !== undefined) return a[grupo];
  const g = limites[grupo];
  return g ? g[dow(data)] : null;
};

export const contar = (
  pedidos: Pedido[], data: string, grupo: string, incluirPendentes: boolean,
  byId: Map<number, Funcionario>,
) =>
  pedidos.filter((p) => {
    if (p.data !== data || p.status === "Negado") return false;
    if (p.status === "Pendente" && !incluirPendentes) return false;
    return alvosDe(p, byId).includes(grupo as GrupoKey);
  }).length;

// a casa fica sem nenhum gerente nesse dia?
export const semGerente = (
  data: string, equipe: Funcionario[], pedidos: Pedido[],
): boolean => {
  const escalados = equipe.filter((e) => e.gerente && e.ativo && diasTodos(e).includes(dow(data)));
  if (!escalados.length) return false;
  return escalados.every((g) =>
    pedidos.some((p) => p.funcionario_id === g.id && p.data === data && p.status !== "Negado"),
  );
};
