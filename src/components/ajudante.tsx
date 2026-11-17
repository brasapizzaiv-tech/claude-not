"use client";

// Ajudante do painel (etapa 1): botão "Ajuda" no canto e uma conversa que
// explica como usar o sistema. Só no computador (some em telas pequenas).
// A resposta chega aos poucos (streaming) de /api/ajudante.

import { Fragment, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Icone } from "./icone";

type Mensagem = { papel: "usuario" | "ajudante"; texto: string };

const GUARDA = "ajudante_conversa";
const EXEMPLOS = ["Como lanço uma sangria no caixa?", "Onde vejo as contas que vencem esta semana?", "Como faço uma contagem de estoque?"];

function lerGuardado(): Mensagem[] {
  try {
    const v = JSON.parse(sessionStorage.getItem(GUARDA) ?? "[]");
    return Array.isArray(v) ? v.filter((m) => m && (m.papel === "usuario" || m.papel === "ajudante") && typeof m.texto === "string") : [];
  } catch {
    return [];
  }
}

// Negrito (**x**) dentro de uma linha, sem HTML cru.
function emLinha(texto: string) {
  return texto.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith("**") && p.endsWith("**") && p.length > 4 ? <strong key={i}>{p.slice(2, -2)}</strong> : <Fragment key={i}>{p}</Fragment>,
  );
}

// Markdown simples da resposta: parágrafos, listas numeradas e com marcador, títulos.
function Resposta({ texto }: { texto: string }) {
  const blocos: React.ReactNode[] = [];
  let lista: { tipo: "ol" | "ul"; itens: string[] } | null = null;
  const fecharLista = () => {
    if (!lista) return;
    const L = lista;
    blocos.push(
      L.tipo === "ol" ? (
        <ol key={blocos.length} className="ml-5 list-decimal space-y-1">{L.itens.map((t, i) => <li key={i}>{emLinha(t)}</li>)}</ol>
      ) : (
        <ul key={blocos.length} className="ml-5 list-disc space-y-1">{L.itens.map((t, i) => <li key={i}>{emLinha(t)}</li>)}</ul>
      ),
    );
    lista = null;
  };
  for (const linha of texto.split("\n")) {
    const num = linha.match(/^\s*\d+[.)]\s+(.*)$/);
    const pto = linha.match(/^\s*[-*•]\s+(.*)$/);
    if (num || pto) {
      const tipo = num ? "ol" : "ul";
      if (lista && lista.tipo !== tipo) fecharLista();
      if (!lista) lista = { tipo, itens: [] };
      lista.itens.push((num ?? pto)![1]);
      continue;
    }
    fecharLista();
    const t = linha.trim();
    if (!t) continue;
    const titulo = t.match(/^#{1,4}\s+(.*)$/);
    blocos.push(titulo ? <p key={blocos.length} className="font-semibold">{emLinha(titulo[1])}</p> : <p key={blocos.length}>{emLinha(t)}</p>);
  }
  fecharLista();
  return <div className="space-y-2">{blocos}</div>;
}

export function Ajudante() {
  const tela = usePathname();
  const [aberto, setAberto] = useState(false);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [texto, setTexto] = useState("");
  const [esperando, setEsperando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const fim = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);

  // A conversa sobrevive à troca de tela (mesma aba); some ao fechar a aba.
  // Lê o que estava guardado só ao abrir, e só grava depois disso.
  const carregado = useRef(false);
  function abrir() {
    if (!carregado.current) {
      carregado.current = true;
      setMensagens(lerGuardado());
    }
    setAberto(true);
  }
  useEffect(() => {
    if (!carregado.current) return;
    try {
      sessionStorage.setItem(GUARDA, JSON.stringify(mensagens.slice(-20)));
    } catch {}
    fim.current?.scrollIntoView({ block: "end" });
  }, [mensagens]);
  useEffect(() => {
    if (!aberto) return;
    campo.current?.focus();
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAberto(false);
        botao.current?.focus();
      }
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [aberto]);

  async function perguntar(pergunta: string) {
    const p = pergunta.trim();
    if (!p || esperando) return;
    setErro(null);
    setTexto("");
    // Manda só as últimas trocas (o servidor aceita até 20 mensagens, começando pela pessoa).
    let historico: Mensagem[] = [...mensagens, { papel: "usuario" as const, texto: p }].slice(-19);
    if (historico[0]?.papel !== "usuario") historico = historico.slice(1);
    setMensagens([...historico, { papel: "ajudante", texto: "" }]);
    setEsperando(true);
    try {
      const res = await fetch("/api/ajudante", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensagens: historico, tela }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => null);
        setMensagens(historico.slice(0, -1));
        setTexto(p);
        setErro(j?.erro ?? "Não consegui falar com o Ajudante. Confira a internet e tente de novo.");
        return;
      }
      const leitor = res.body.getReader();
      const dec = new TextDecoder();
      let resposta = "";
      for (;;) {
        const { done, value } = await leitor.read();
        if (done) break;
        resposta += dec.decode(value, { stream: true });
        const r = resposta;
        setMensagens([...historico, { papel: "ajudante", texto: r }]);
      }
      if (!resposta.trim()) setMensagens([...historico, { papel: "ajudante", texto: "Não consegui responder agora. Tente de novo." }]);
    } catch {
      setMensagens(historico.slice(0, -1));
      setTexto(p);
      setErro("A conexão caiu no meio da resposta. Confira a internet e tente de novo.");
    } finally {
      setEsperando(false);
      campo.current?.focus();
    }
  }

  return (
    <div className="hidden lg:block">
      {!aberto && (
        <button
          ref={botao}
          type="button"
          onClick={abrir}
          className="btn-secundario fixed bottom-6 right-6 z-30 inline-flex items-center gap-2 rounded-full px-5"
          aria-label="Abrir o Ajudante do sistema"
        >
          <Icone nome="duvida" tamanho={18} /> Ajuda
        </button>
      )}
      {aberto && (
        <aside
          role="dialog"
          aria-label="Ajudante do sistema"
          className="cartao fixed bottom-4 right-4 top-4 z-40 flex w-[420px] flex-col overflow-hidden"
        >
          <header className="flex items-center justify-between gap-3 border-b border-borda px-5 py-4">
            <div>
              <h2 className="font-numero text-lg font-bold text-texto">Ajudante</h2>
              <p className="text-xs text-texto-fraco">Tira dúvidas sobre como usar o sistema</p>
            </div>
            <div className="flex items-center gap-1">
              {mensagens.length > 0 && (
                <button type="button" onClick={() => { setMensagens([]); setErro(null); }} disabled={esperando} className="min-h-11 rounded-controle px-3 text-sm text-texto-suave hover:bg-superficie-suave disabled:opacity-50">
                  Limpar
                </button>
              )}
              <button type="button" onClick={() => { setAberto(false); botao.current?.focus(); }} aria-label="Fechar o Ajudante" className="flex h-11 w-11 items-center justify-center rounded-controle text-texto-suave hover:bg-superficie-suave">
                <Icone nome="fechar" tamanho={18} />
              </button>
            </div>
          </header>

          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm leading-relaxed" aria-live="polite">
            {mensagens.length === 0 ? (
              <div className="space-y-3 text-texto-suave">
                <p>Pergunte como fazer alguma coisa no sistema, onde fica uma tela ou o que quer dizer um aviso.</p>
                <p className="text-xs text-texto-fraco">O Ajudante não vê os dados do restaurante e não faz nada no sistema: ele só explica.</p>
                <div className="flex flex-col items-start gap-2 pt-1">
                  {EXEMPLOS.map((e) => (
                    <button key={e} type="button" onClick={() => perguntar(e)} className="pilula min-h-11 text-left">
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              mensagens.map((m, i) =>
                m.papel === "usuario" ? (
                  <div key={i} className="ml-8 rounded-cartao bg-destaque px-4 py-3 text-texto">{m.texto}</div>
                ) : (
                  <div key={i} className="text-texto">
                    {m.texto ? <Resposta texto={m.texto} /> : <span className="inline-flex items-center gap-2 text-texto-fraco"><Icone nome="esperando" tamanho={16} className="animate-spin" /> Pensando…</span>}
                  </div>
                ),
              )
            )}
            <div ref={fim} />
          </div>

          <form
            className="border-t border-borda px-5 py-4"
            onSubmit={(e) => {
              e.preventDefault();
              perguntar(texto);
            }}
          >
            {erro && <p role="alert" className="mb-2 text-sm text-urgente-texto">{erro}</p>}
            <label htmlFor="ajudante-pergunta" className="rotulo mb-1 block">Sua pergunta</label>
            <textarea
              id="ajudante-pergunta"
              ref={campo}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  perguntar(texto);
                }
              }}
              rows={2}
              maxLength={4000}
              placeholder="Ex.: como fecho o caixa do dia?"
              className="campo w-full resize-none"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-xs text-texto-fraco">Enter envia · Shift+Enter pula linha</span>
              <button type="submit" disabled={esperando || !texto.trim()} className="btn-principal px-5">
                {esperando ? "Respondendo…" : "Perguntar"}
              </button>
            </div>
          </form>
        </aside>
      )}
    </div>
  );
}
