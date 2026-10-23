"use client";

import { useState, useTransition } from "react";
import { entrarGarcomAvulso } from "../actions";

export function EntrarAvulso({ token }: { token: string }) {
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [indo, start] = useTransition();
  function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    start(async () => {
      const r = await entrarGarcomAvulso(token, nome);
      if (r && !r.ok) setErro(r.mensagem);
    });
  }
  return (
    <form onSubmit={entrar} className="mt-4 flex flex-col gap-3">
      <input
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        placeholder="Seu nome"
        aria-label="Seu nome"
        autoComplete="given-name"
        autoFocus
        maxLength={40}
        className="min-h-12 w-full rounded-controle border border-borda-forte bg-painel-cartao px-4 text-center text-lg text-texto focus:border-primaria"
      />
      <button type="submit" disabled={indo || nome.trim().length < 2} className="btn-principal disabled:opacity-50">
        {indo ? "Entrando…" : "Entrar"}
      </button>
      {erro && <p className="text-sm text-urgente-texto" role="alert">{erro}</p>}
    </form>
  );
}
