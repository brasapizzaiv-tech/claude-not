"use client";
import { Icone } from "@/components/icone";

import { useCallback, useRef, useState, useTransition } from "react";
import { LeitorQr } from "@/components/leitor-qr";
import { useRouter } from "next/navigation";
import { acharComanda, abrirComanda } from "./actions";

// Busca rápida do garçom: digitar o número da comanda/cartão OU ler o QR do
// cupom / código de barras do cartão pela câmera do celular. Ao achar, abre o
// cardápio da mesa já com a comanda selecionada. Se não achar, oferece abrir
// uma nova comanda escolhendo a mesa.
export function BuscaComanda({ mesas }: { mesas: string[] }) {
  const router = useRouter();
  const [proc, start] = useTransition();
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [scan, setScan] = useState(false);
  // Quando não acha: guarda o código e mostra a escolha de mesa para abrir nova.
  const [abrirCod, setAbrirCod] = useState<string | null>(null);

  const abrir = useCallback(
    (valor: string) => {
      const v = (valor || "").trim();
      if (!v) return;
      setErro(null);
      start(async () => {
        const r = await acharComanda(v);
        if (r.ok) {
          router.push(`/garcom/mesa/${encodeURIComponent(r.mesa)}?comanda=${r.comandaId}`);
        } else {
          setAbrirCod(v);
        }
      });
    },
    [router],
  );

  function novaComanda(mesa: string) {
    const cod = abrirCod ?? "";
    start(async () => {
      const r = await abrirComanda(mesa, cod);
      if (r.ok) {
        setAbrirCod(null);
        router.push(`/garcom/mesa/${encodeURIComponent(r.mesa)}?comanda=${r.comandaId}`);
      } else {
        setErro(r.mensagem || "Não foi possível abrir.");
        setTimeout(() => setErro(null), 3500);
      }
    });
  }

  const onLido = useCallback(
    (v: string) => { setScan(false); setCodigo(v); abrir(v); },
    [abrir],
  );

  return (
    <>
      <div className="mb-2 flex items-center gap-2 px-1">
        <input aria-label="Nº da comanda / cartão"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && abrir(codigo)}
          inputMode="numeric"
          placeholder="Nº da comanda / cartão"
          className="h-11 flex-1 rounded-controle border border-borda-forte bg-painel-cartao px-3 text-sm text-texto placeholder:text-texto-fraco"
        />
        <button
          onClick={() => abrir(codigo)}
          disabled={proc || !codigo.trim()}
          className="btn-principal !min-h-11 text-sm"
        >
          {proc ? "..." : "Abrir"}
        </button>
        <button
          onClick={() => { setErro(null); setScan(true); }}
          title="Ler QR / código de barras"
          className="flex h-11 w-11 items-center justify-center rounded-controle border border-borda-forte text-xl"
        >
          <Icone nome="camera" tamanho={20} titulo="Ler código" />
        </button>
      </div>
      {erro && <p role="alert" className="mb-2 px-1 text-sm text-red-400">{erro}</p>}
      {scan && (
        <Scanner onClose={() => setScan(false)} onLido={onLido} />
      )}
      {abrirCod !== null && (
        <div className="area-segura fixed inset-0 z-[65] flex flex-col bg-painel-fundo text-texto">
          <div className="flex items-center justify-between border-b border-borda p-3">
            <span className="text-lg font-bold">Abrir comanda</span>
            <button aria-label="Fechar" onClick={() => setAbrirCod(null)} className="text-texto-suave">✕</button>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <p className="mb-3 text-sm text-texto-suave">
              {/^\d{1,4}$/.test(abrirCod) ? (
                <>A comanda <span className="font-semibold text-texto">{abrirCod}</span> não está aberta. Escolha a mesa para abrir a comanda {abrirCod}:</>
              ) : (
                <>Não existe comanda aberta com <span className="font-semibold text-texto">{abrirCod}</span>. Escolha a mesa para abrir uma nova:</>
              )}
            </p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {mesas.map((m) => (
                <button
                  key={m}
                  onClick={() => novaComanda(m)}
                  disabled={proc}
                  className="rounded-controle border border-borda-forte px-2 py-3 text-sm font-medium text-texto active:bg-blue-600 disabled:opacity-50"
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// A câmera é o leitor único do sistema (components/leitor-qr), lendo QR e
// código de barras do cartão. Fecha na primeira leitura (o pai fecha ao ler).
function Scanner({ onClose, onLido }: { onClose: () => void; onLido: (v: string) => void }) {
  const jaLeu = useRef(false);
  return (
    <LeitorQr
      titulo="Ler comanda"
      formatos="todos"
      mensagem="Aponte para o QR do cupom ou o código do cartão…"
      fechar={onClose}
      aoLer={(v) => {
        if (jaLeu.current) return;
        jaLeu.current = true;
        if (navigator.vibrate) navigator.vibrate(80);
        onLido(v);
      }}
    >
      <p className="pt-2 text-center text-sm text-zinc-400">Sem câmera? Feche e digite o número da comanda.</p>
    </LeitorQr>
  );
}
