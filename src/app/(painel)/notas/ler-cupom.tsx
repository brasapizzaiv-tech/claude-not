"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LeitorQr } from "@/components/leitor-qr";
import { Icone } from "@/components/icone";
import { importarCupomNfce } from "./actions";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Resultado =
  | { ok: true; notaId?: string; fornecedor: string; valor: number; itens: number; pagamentos: { forma: string; valor: number }[] }
  | { ok: false; erro: string };

// Cupom de supermercado (NFC-e): lê o QR code do cupom com a câmera (ou cola o
// endereço do QR) e a nota entra pendente em Notas, com os itens que a SEFAZ
// devolve. Daí pra frente é igual às notas de XML.
export function LerCupom() {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [lendo, setLendo] = useState(false);
  const [texto, setTexto] = useState("");
  const [res, setRes] = useState<Resultado | null>(null);

  async function importar(conteudo: string) {
    if (lendo) return;
    setLendo(true);
    setRes(null);
    try {
      const r = (await importarCupomNfce(conteudo)) as Resultado;
      setRes(r);
      if (r.ok) {
        setAberto(false);
        setTexto("");
        router.refresh();
      }
    } catch {
      setRes({ ok: false, erro: "Não consegui falar com o sistema. Tente de novo." });
    } finally {
      setLendo(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => { setRes(null); setAberto(true); }}
        className="btn-secundario inline-flex min-h-11 items-center gap-2 text-sm"
      >
        <Icone nome="cupom" tamanho={16} /> Ler cupom (QR)
      </button>

      {res && (
        <div className={`mt-3 max-w-sm rounded-controle px-3 py-2 text-sm ${res.ok ? "bg-superficie-suave text-texto" : "bg-urgente-fundo text-urgente-texto"}`}>
          {res.ok ? (
            <>
              <b>Cupom importado:</b> {res.fornecedor}, {brl(res.valor)}, {res.itens} item(ns)
              {res.pagamentos.length ? ` · ${res.pagamentos.map((p) => p.forma).join(", ")}` : ""}.{" "}
              {res.notaId && (
                <Link href={`/notas/${res.notaId}`} className="font-semibold text-texto-marca underline">
                  Abrir a nota pra lançar
                </Link>
              )}
            </>
          ) : (
            res.erro
          )}
        </div>
      )}

      {aberto && (
        <LeitorQr
          titulo="Ler o QR code do cupom"
          aoLer={(t) => void importar(t)}
          fechar={() => setAberto(false)}
          aviso={lendo ? "Buscando o cupom na SEFAZ…" : res && !res.ok ? res.erro : null}
        >
          <form
            className="flex gap-2"
            onSubmit={(e) => { e.preventDefault(); if (texto.trim()) void importar(texto); }}
          >
            <label htmlFor="cupom-endereco" className="sr-only">Endereço do QR code</label>
            <input
              id="cupom-endereco"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Ou cole o endereço do QR"
              className="min-h-11 flex-1 rounded-controle border border-borda bg-painel-cartao px-3 text-sm text-texto"
            />
            <button type="submit" disabled={lendo || !texto.trim()} className="btn-principal min-h-11 px-4 text-sm disabled:opacity-60">
              {lendo ? "Buscando…" : "Importar"}
            </button>
          </form>
        </LeitorQr>
      )}
    </div>
  );
}
