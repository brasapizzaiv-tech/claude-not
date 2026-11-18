"use client";

// Ideias pro cardápio do dia (pedido do Rafael, 18/11/2026), no celular da
// cozinha e no painel:
//  - Sobras do último dia servido → o que a IA sugere fazer com elas
//    (carreteiro → bolinho de carreteiro);
//  - Pratos que não saem há 14 dias ou mais — por CUBA quando o mapa das cubas
//    está cadastrado (0319), senão por grupo (os bem usados).
// Um toque põe o prato no grupo certo; a pessoa ainda salva/publica como sempre.
import { chaveNome, type Esquecido, type Grupo, type IdeiasDia, type ItemCatalogo } from "@/lib/cardapio-dia-core";

const DIA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const diaCurto = (iso: string) => {
  const [a, m, d] = iso.split("-").map(Number);
  return `${DIA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
};
const GRUPO: Record<Grupo, string> = { proteinas: "Proteínas", carboidratos: "Acompanhamentos", especial: "Especial" };

export function CardapioIdeias({
  ideias, itens, sel, adicionar, grande = false,
}: {
  ideias: IdeiasDia;
  itens: ItemCatalogo[];
  sel: Record<Grupo, string[]>;
  adicionar: (g: Grupo, nome: string) => void;
  /** Celular da cozinha: letra e botões maiores. */
  grande?: boolean;
}) {
  const ja = new Set(Object.values(sel).flat().map(chaveNome));
  const porChave = new Map(itens.map((i) => [`${i.grupo}|${chaveNome(i.nome)}`, i]));

  const sobras = (ideias.anterior?.pratos ?? [])
    .map((p) => ({ prato: p.nome, ideias: (porChave.get(`${p.grupo}|${chaveNome(p.nome)}`)?.reaproveitar ?? []).filter((x) => !ja.has(chaveNome(x.nome))) }))
    .filter((s) => s.ideias.length > 0);

  const esquecidos = (["proteinas", "carboidratos", "especial"] as Grupo[])
    // Só o que ainda está no catálogo (prato renomeado ou tirado não volta como ideia).
    .map((g) => ({ g, lista: ideias.esquecidos.filter((e) => e.grupo === g && !ja.has(chaveNome(e.nome)) && porChave.has(`${g}|${chaveNome(e.nome)}`)).slice(0, grande ? 5 : 6) }))
    .filter((x) => x.lista.length > 0);

  // Por cuba: até 3 (painel) ou 2 (celular) pratos de cada cuba que não estão no dia.
  // Prato que serve em várias cubas (abobrinha ao forno na 10, 11 e 12) aparece só na primeira.
  const mostrados = new Set<string>();
  const cubas = (ideias.porCuba ?? [])
    .map((c) => {
      const pratos = c.pratos.filter((p) => !ja.has(chaveNome(p.nome)) && !mostrados.has(chaveNome(p.nome))).slice(0, grande ? 2 : 3);
      for (const p of pratos) mostrados.add(chaveNome(p.nome));
      return { ...c, pratos };
    })
    .filter((c) => c.pratos.length > 0);

  if (sobras.length === 0 && esquecidos.length === 0 && cubas.length === 0) return null;

  const btn = grande
    ? "min-h-11 rounded-full bg-destaque px-3 py-2 text-left text-base font-medium text-texto"
    : "min-h-9 rounded-full bg-destaque px-3 py-1 text-left text-sm font-medium text-texto";
  const meta = grande ? "text-xs text-texto-suave" : "text-mini text-texto-suave";

  return (
    <details className="cartao p-3" open>
      <summary className={`cursor-pointer font-bold text-texto ${grande ? "text-base" : "text-sm"}`}>Ideias para este dia</summary>

      {sobras.length > 0 && ideias.anterior && (
        <div className="mt-3">
          <p className="rotulo">Sobras de {diaCurto(ideias.anterior.data)} · o que dá pra fazer</p>
          <ul className="mt-1.5 space-y-2">
            {sobras.map((s) => (
              <li key={s.prato}>
                <p className={meta}>Sobrou {s.prato}?</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {s.ideias.map((x) => (
                    <button key={x.nome} type="button" onClick={() => adicionar(x.grupo, x.nome)} className={btn}>
                      + {x.nome} <span className={meta}>({GRUPO[x.grupo].toLowerCase()})</span>
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {cubas.length > 0 && (
        <div className="mt-3">
          <p className="rotulo">Faz tempo que não sai · por cuba</p>
          {cubas.map((c) => (
            <div key={c.cuba} className="mt-1.5">
              <p className={meta}>Cuba {c.cuba} · {c.nome}</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {c.pratos.map((p) => (
                  <button key={p.nome} type="button" onClick={() => adicionar(p.grupo, p.nome)} className={btn}>
                    + {p.nome} <span className={meta}>· {p.ultimo ? `último ${diaCurto(p.ultimo)}` : "ainda não saiu pelo sistema"}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {cubas.length === 0 && esquecidos.length > 0 && (
        <div className="mt-3">
          <p className="rotulo">Faz tempo que não sai</p>
          {esquecidos.map(({ g, lista }) => (
            <div key={g} className="mt-1.5">
              <p className={meta}>{GRUPO[g]}</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {lista.map((e: Esquecido) => (
                  <button key={e.nome} type="button" onClick={() => adicionar(g, e.nome)} className={btn}>
                    + {e.nome} <span className={meta}>· último {diaCurto(e.ultimo)}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <p className={`mt-3 ${meta}`}>Toque pra pôr no cardápio. Depois é só salvar e publicar como sempre.</p>
    </details>
  );
}
