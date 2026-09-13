"use client";

// Tela inicial do app nativo: lembra o token do entregador neste aparelho.
// Aceita o link inteiro colado ou só o código. Se já tem, entra direto.
import { useEffect, useState } from "react";

const CHAVE = "entrega_token";
const LARANJA = "#C78340";

export function EntradaEntrega() {
  const [valor, setValor] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [lembrado, setLembrado] = useState<string | null>(null);

  useEffect(() => {
    let t: string | null = null;
    try { t = localStorage.getItem(CHAVE); } catch { /* sem storage */ }
    if (t && /^[0-9a-f]{16,64}$/i.test(t)) {
      const timer = setTimeout(() => { window.location.replace(`/entrega/${t}`); }, 0);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => setLembrado(""), 0);
    return () => clearTimeout(timer);
  }, []);

  function entrar() {
    const m = valor.trim().match(/([0-9a-f]{16,64})\s*$/i);
    if (!m) { setErro("Cole o link que a Brasa te mandou (ou só o código do final dele)."); return; }
    try { localStorage.setItem(CHAVE, m[1]); } catch { /* sem storage */ }
    window.location.replace(`/entrega/${m[1]}`);
  }

  if (lembrado === null) {
    return <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">Abrindo…</div>;
  }
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 p-6 text-zinc-100">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/entregas-192.png" alt="" className="mb-4 h-24 w-24 rounded-3xl" />
      <h1 className="text-2xl font-bold">Brasa Entregas</h1>
      <p className="mb-6 mt-1 text-center text-sm text-zinc-400">Cole aqui o link pessoal que a gerência te mandou no WhatsApp. Só precisa uma vez.</p>
      <input
        value={valor}
        onChange={(e) => { setValor(e.target.value); setErro(null); }}
        onKeyDown={(e) => { if (e.key === "Enter") entrar(); }}
        placeholder="https://www.brasarestaurante.com.br/entrega/…"
        className="w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-3 text-base outline-none focus:border-orange-500"
      />
      {erro && <p className="mt-2 text-sm text-rose-400">{erro}</p>}
      <button onClick={entrar} className="mt-4 w-full max-w-md rounded-xl py-3.5 text-base font-bold text-white" style={{ background: LARANJA }}>Entrar</button>
    </div>
  );
}
