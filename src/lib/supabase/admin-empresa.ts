import { createAdminClient } from "./admin";

// Chave administrativa PRESA a uma empresa (etapa B do multiempresa, 19/11/2026).
//
// Os apps por link (equipe /eu, folga, cotação, contagem, TV) não têm login, então
// usam a chave administrativa — que passa por cima das regras do banco. Antes cada
// consulta precisava lembrar de `.eq("empresa_id", ...)` à mão, e as bibliotecas
// compartilhadas (checklists, ponto, conferência) não lembravam.
//
// Este cliente faz isso sozinho em TODA tabela:
//   - select / update / delete  →  ganham `.eq("empresa_id", empresa)`
//   - insert / upsert           →  cada linha sai com `empresa_id: empresa`
// O resto (rpc, storage) passa direto.
//
// Uso: `const db = adminDaEmpresa(colab.empresa_id)` — a empresa vem SEMPRE de
// algo que já foi validado (o token do link, a chave da TV), nunca da tela.

// Tabelas sem dono: são do sistema, não de um restaurante.
const SEM_EMPRESA = new Set(["empresas", "_migrations"]);

type Admin = ReturnType<typeof createAdminClient>;

function carimba(valor: unknown, empresa: string): unknown {
  if (Array.isArray(valor)) return valor.map((v) => carimba(v, empresa));
  if (valor && typeof valor === "object") return { ...(valor as Record<string, unknown>), empresa_id: empresa };
  return valor;
}

export function adminDaEmpresa(empresaId: string, base: Admin = createAdminClient()): Admin {
  if (!empresaId) throw new Error("Empresa não identificada.");
  const de = (tabela: string) => {
    const q = base.from(tabela);
    if (SEM_EMPRESA.has(tabela)) return q;
    return new Proxy(q, {
      get(alvo, nome, recebedor) {
        const original = Reflect.get(alvo, nome, recebedor);
        if (typeof original !== "function") return original;
        switch (nome) {
          case "select":
          case "update":
          case "delete":
            return (...args: unknown[]) =>
              (original as (...a: unknown[]) => { eq: (c: string, v: string) => unknown })
                .apply(alvo, args)
                .eq("empresa_id", empresaId);
          case "insert":
          case "upsert":
            return (valores: unknown, ...resto: unknown[]) =>
              (original as (...a: unknown[]) => unknown).apply(alvo, [carimba(valores, empresaId), ...resto]);
          default:
            return original.bind(alvo);
        }
      },
    });
  };
  return new Proxy(base, {
    get(alvo, nome, recebedor) {
      if (nome === "from") return de;
      const original = Reflect.get(alvo, nome, recebedor);
      return typeof original === "function" ? original.bind(alvo) : original;
    },
  }) as Admin;
}
