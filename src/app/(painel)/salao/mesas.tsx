"use client";
import { Icone } from "@/components/icone";
import { Enviar } from "@/components/enviar";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { criarComandaMesa } from "./actions";

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export type ComandaMini = {
  id: string; numero: number; total: number;
  contaPedida?: boolean; contaPor?: string | null;
};
export type Mesa = { nome: string; tipo: "balcao" | "mesa" | "balanca"; comandas: ComandaMini[] };

export function MesasGrid({
  mesas,
  base = "/salao/comandas",
  destino = "salao",
  admin = true,
}: {
  mesas: Mesa[];
  base?: string;
  destino?: string;
  admin?: boolean;
}) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState<"todas" | "livres" | "ocupadas">("todas");
  const [pgto, setPgto] = useState("");
  const [pgtoErro, setPgtoErro] = useState("");
  const pgtoRef = useRef<HTMLInputElement>(null);

  // Nº da comanda → id (todas as comandas abertas do salão).
  const numeroParaId = useMemo(() => {
    const m = new Map<number, string>();
    for (const mesa of mesas) for (const c of mesa.comandas) m.set(c.numero, c.id);
    return m;
  }, [mesas]);

  // Pagamento rápido: aceita o nº digitado OU o QR lido pelo leitor
  // (o QR contém a URL .../salao/comandas/<uuid>). Vai direto ao caixa
  // com a comanda já selecionada.
  function irPagamento() {
    const v = pgto.trim();
    if (!v) return;
    const uuid = v.match(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
    let id: string | undefined;
    if (uuid) id = uuid[0];
    else {
      const n = Number(v.replace(/\D/g, ""));
      if (n) id = numeroParaId.get(n);
    }
    if (!id) {
      setPgtoErro(`Comanda “${v}” não encontrada (aberta).`);
      return;
    }
    setPgtoErro("");
    setPgto("");
    router.push(`/salao/caixa?abrir=${id}`);
  }

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return mesas.filter((m) => {
      if (q && !m.nome.toLowerCase().includes(q)) return false;
      const ocupada = m.comandas.length > 0;
      if (situacao === "livres" && ocupada) return false;
      if (situacao === "ocupadas" && !ocupada) return false;
      return true;
    });
  }, [mesas, busca, situacao]);

  return (
    <div>
      {/* Pagamento rápido: nº da comanda ou leitura do QR pelo leitor */}
      {admin && (
        <div className="mb-4">
          {/* Cartão de foco: a ação principal desta tela. Chama atenção
              invertendo o fundo, não colorindo. */}
          <div className="cartao-foco flex items-center gap-3 px-5 py-4" style={{ "--foco": "var(--painel-foco-texto)" } as React.CSSProperties}>
            <Icone nome="cartao" tamanho={22} className="shrink-0 text-painel-foco-rotulo" />
            <input
              ref={pgtoRef}
              value={pgto}
              onChange={(e) => {
                setPgto(e.target.value);
                if (pgtoErro) setPgtoErro("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") irPagamento();
              }}
              autoFocus
              placeholder="Pagamento rápido — digite o nº da comanda ou leia o QR e tecle Enter"
              className="min-w-0 flex-1 bg-transparent text-lg font-medium placeholder:text-painel-foco-suave"
            />
            <button
              onClick={irPagamento}
              className="btn-principal shrink-0 text-sm"
            >
              Ir ao caixa
            </button>
          </div>
          {pgtoErro && <p className="mt-1 px-1 text-sm text-erro">{pgtoErro}</p>}
        </div>
      )}

      {/* Filtros */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {([["todas", "Todas"], ["ocupadas", "Ocupadas"], ["livres", "Livres"]] as const).map(([v, rot]) => {
          const ativo = situacao === v;
          const n = v === "todas" ? mesas.length : mesas.filter((m) => (m.comandas.length > 0) === (v === "ocupadas")).length;
          return (
            <button
              key={v}
              type="button"
              onClick={() => setSituacao(v)}
              aria-pressed={ativo}
              className={`flex min-h-11 items-center gap-2 rounded-full pl-4 pr-2 text-[13.5px] ${ativo ? "bg-marca-escuro font-semibold text-painel-foco-texto dark:bg-painel-foco-fundo" : "bg-painel-cartao text-texto shadow-controle"}`}
            >
              {rot}
              <span className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-bold ${ativo ? "bg-primaria text-marca-sobre-primaria" : "bg-superficie-suave text-texto-suave"}`}>{n}</span>
            </button>
          );
        })}
        <label className="ml-auto flex h-[46px] w-full max-w-[360px] items-center gap-2.5 rounded-controle bg-painel-cartao px-4 shadow-controle">
          <Icone nome="buscar" tamanho={18} className="shrink-0 text-texto-fraco" />
          <span className="sr-only">Buscar por mesa</span>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por mesa…"
            className="h-full min-w-0 flex-1 bg-transparent text-sm text-texto placeholder:text-texto-fraco"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {filtradas.map((m) => (
          <MesaCard key={m.nome} mesa={m} base={base} destino={destino} />
        ))}
      </div>
      {filtradas.length === 0 && (
        <p className="mt-8 text-center text-sm text-texto-fraco">Nenhuma mesa encontrada.</p>
      )}
    </div>
  );
}

function MesaCard({ mesa, base, destino }: { mesa: Mesa; base: string; destino: string }) {
  const ocupada = mesa.comandas.length > 0;
  const total = mesa.comandas.reduce((s, c) => s + c.total, 0);
  // Mesma linguagem do mapa da tela inicial: cheio = ocupada, contorno = pediu
  // a conta, neutro = livre. O laranja da marca é a ÚNICA cor desta tela.
  const pediuConta = mesa.comandas.some((c) => c.contaPedida);
  const quemMarcou = mesa.comandas.find((c) => c.contaPedida)?.contaPor ?? null;

  return (
    <div
      className={`cartao flex flex-col p-3.5 ${
        pediuConta ? "ring-2 ring-primaria" : ""
      }`}
    >
      <div className="mb-2 flex items-center gap-2">
        {/* Quadradinho com o número: cheio = ocupada, contorno = conta pedida, neutro = livre. */}
        {mesa.tipo === "mesa" && (
          <span
            aria-hidden
            className={`flex h-[30px] min-w-[30px] items-center justify-center rounded-mesa px-1 font-numero text-[13px] font-bold ${
              pediuConta
                ? "bg-painel-cartao text-texto shadow-[inset_0_0_0_2px_var(--marca-primaria)]"
                : ocupada
                  ? "bg-primaria text-marca-sobre-primaria shadow-brilho"
                  : "bg-superficie-suave text-texto-fraco"
            }`}
          >
            {mesa.nome.replace(/\D/g, "") || "·"}
          </span>
        )}
        {ocupada && mesa.tipo !== "balanca" ? (
          <Link
            href={`/salao/mesa/${encodeURIComponent(mesa.nome)}`}
            className="truncate font-semibold text-texto hover:underline"
            title="Ver detalhes da mesa"
          >
            {mesa.nome}
          </Link>
        ) : (
          <span className="truncate font-semibold text-texto">{mesa.nome}</span>
        )}
        <span
          className={`ml-auto shrink-0 whitespace-nowrap font-numero text-sm tracking-apertada ${
            ocupada ? "font-semibold text-texto" : "text-texto-fraco"
          }`}
        >
          {ocupada ? brl(total) : "Livre"}
        </span>
      </div>

      {pediuConta && (
        <p className="mb-1.5"><span className="pilula">pediu a conta{quemMarcou ? ` · ${quemMarcou}` : ""}</span></p>
      )}

      <div className="mb-2 min-h-[2.5rem] space-y-1">
        {mesa.comandas.length === 0 ? (
          <p className="text-xs text-texto-fraco">Sem comandas</p>
        ) : (
          mesa.comandas.map((c) => (
            <Link
              key={c.id}
              href={`${base}/${c.id}`}
              className="flex min-h-11 items-center justify-between rounded-mesa bg-painel-fundo px-2.5 text-xs transition hover:bg-destaque"
            >
              <span className="font-medium text-texto">#{c.numero}</span>
              <span className="font-numero tracking-apertada text-texto-suave">{brl(c.total)}</span>
            </Link>
          ))
        )}
      </div>

      {mesa.tipo === "balanca" ? (
        <Link
          href="/salao/balanca"
          className="mt-auto flex min-h-11 items-center justify-center rounded-controle bg-superficie-suave px-2 text-xs font-semibold text-texto transition hover:bg-destaque"
        >
          <Icone nome="balanca" tamanho={15} className="mr-1.5" /> Pesar
        </Link>
      ) : (
        <form action={criarComandaMesa} className="mt-auto">
          <input type="hidden" name="mesa" value={mesa.nome} />
          <input type="hidden" name="destino" value={destino} />
          <Enviar className="min-h-11 w-full rounded-controle bg-superficie-suave px-2 text-xs font-semibold text-texto transition hover:bg-destaque">
            + Comanda
          </Enviar>
        </form>
      )}
    </div>
  );
}
