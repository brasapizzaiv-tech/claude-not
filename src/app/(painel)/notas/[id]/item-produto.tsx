"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { categoriasDeEstoque, criarProdutoDoItem, vincularItemProduto } from "../actions";
import { Combobox } from "@/components/combobox";
import { Janela } from "@/components/janela";
import { BotaoAcao } from "@/components/enviar";
import { Icone } from "@/components/icone";
import { avisar } from "@/components/dialogo";

const UNIDADES = ["un", "kg", "g", "L", "ml", "cx", "pct", "fardo", "dz", "saco", "bandeja"];

/** Unidade da nota → unidade em que o produto costuma ser contado. */
function unidadeSugerida(un: string | null | undefined) {
  const u = (un ?? "").trim().toUpperCase();
  if (["KG", "KGS", "KILO"].includes(u)) return "kg";
  if (["L", "LT", "LTS", "LITRO"].includes(u)) return "L";
  if (["G", "GR"].includes(u)) return "g";
  if (["DZ"].includes(u)) return "dz";
  if (["BDJ", "BANDEJA"].includes(u)) return "bandeja";
  return "un";
}

/** "PIMENTAO COLORIDO KG" → "Pimentao colorido kg" (só pra começar; a pessoa ajusta). */
function nomeSugerido(descricao: string) {
  const t = descricao.trim().replace(/\s+/g, " ");
  if (t !== t.toUpperCase()) return t;
  const m = t.toLowerCase();
  return m.charAt(0).toUpperCase() + m.slice(1);
}

export function ItemProduto({
  itemId,
  produtoId,
  produtos,
  descricao = "",
  unidade = "",
}: {
  itemId: string;
  produtoId: string | null;
  produtos: { id: string; nome: string }[];
  /** Texto do item na nota (vira o nome sugerido do produto novo). */
  descricao?: string;
  /** Unidade do item na nota (sugere a unidade do produto novo). */
  unidade?: string;
}) {
  const router = useRouter();
  const [salvando, start] = useTransition();
  const [novo, setNovo] = useState(false);

  return (
    <>
      <Combobox
        options={produtos.map((p) => ({ value: p.id, label: p.nome }))}
        value={produtoId ?? ""}
        onChange={(v) =>
          start(async () => {
            await vincularItemProduto(itemId, v || null);
            router.refresh();
          })
        }
        placeholder="— buscar produto —"
        disabled={salvando}
        className={`w-full rounded-controle border px-2 py-1 text-xs focus:border-orange-500 dark:bg-zinc-950 ${
          produtoId
            ? "border-borda-forte text-texto-suave  "
            : "border-amber-400 text-aviso-texto"
        }`}
      />
      {!produtoId && (
        <button
          type="button"
          onClick={() => setNovo(true)}
          className="mt-1 inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-texto-marca hover:underline"
        >
          <Icone nome="novo" tamanho={13} /> Não achou? Cadastrar produto novo
        </button>
      )}
      {novo && (
        <ProdutoNovo
          itemId={itemId}
          descricao={descricao}
          unidade={unidade}
          onFechar={() => setNovo(false)}
          onFeito={() => { setNovo(false); router.refresh(); }}
        />
      )}
    </>
  );
}

function ProdutoNovo({
  itemId,
  descricao,
  unidade,
  onFechar,
  onFeito,
}: {
  itemId: string;
  descricao: string;
  unidade: string;
  onFechar: () => void;
  onFeito: () => void;
}) {
  const [nome, setNome] = useState(() => nomeSugerido(descricao));
  const [un, setUn] = useState(() => unidadeSugerida(unidade));
  const [categoria, setCategoria] = useState("");
  const [categorias, setCategorias] = useState<{ id: string; nome: string }[] | null>(null);
  useEffect(() => {
    let vivo = true;
    categoriasDeEstoque().then((c) => { if (vivo) setCategorias(c); }).catch(() => { if (vivo) setCategorias([]); });
    return () => { vivo = false; };
  }, []);

  return (
    <Janela onFechar={onFechar} rotulo="Cadastrar produto novo">
      <div className="cartao w-full max-w-lg p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-texto">Cadastrar produto novo</h2>
            <p className="mt-1 text-sm text-texto-suave">Na nota: “{descricao}”. O produto entra no cadastro e o item já fica ligado a ele.</p>
          </div>
          <button type="button" aria-label="Fechar" onClick={onFechar} className="btn-secundario min-h-11 px-3">
            <Icone nome="fechar" tamanho={16} />
          </button>
        </div>
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="rotulo block">Nome (como aparece na contagem)</span>
            <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} className="campo mt-1 w-full" />
          </label>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div className="text-sm">
              <span className="rotulo block">Categoria do estoque</span>
              <Combobox
                options={(categorias ?? []).map((c) => ({ value: c.id, label: c.nome }))}
                value={categoria}
                onChange={setCategoria}
                placeholder={categorias?.length ? "Buscar categoria…" : "Carregando…"}
                className="mt-1"
              />
            </div>
            <label className="block text-sm">
              <span className="rotulo block">Contado em</span>
              <select value={un} onChange={(e) => setUn(e.target.value)} className="campo mt-1 w-full">
                {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </label>
          </div>
          <p className="text-xs text-texto-fraco">Estoque ideal, fardo, validade e dados fiscais ficam pra tela Produtos, se precisar.</p>
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onFechar} className="btn-secundario text-sm">Fechar</button>
          <BotaoAcao
            className="btn-principal text-sm"
            aoClicar={async () => {
              const r = await criarProdutoDoItem(itemId, { nome, categoriaId: categoria, unidade: un });
              if (!r.ok) return avisar(r.erro);
              onFeito();
            }}
          >
            <Icone nome="certo" tamanho={16} /> Cadastrar e ligar
          </BotaoAcao>
        </div>
      </div>
    </Janela>
  );
}
