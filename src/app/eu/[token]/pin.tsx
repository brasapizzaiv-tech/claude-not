"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { definirPin, entrarPin } from "./actions";

const box =
  "w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-center text-2xl tracking-[0.5em] text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";
const btn =
  "w-full rounded-xl bg-orange-500 py-3 font-semibold text-white hover:bg-orange-600 disabled:opacity-60";

export function CriarPin({ token }: { token: string }) {
  const router = useRouter();
  const [p, start] = useTransition();
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  function salvar() {
    setErro(null);
    if (pin.length !== 4) return setErro("O PIN precisa ter 4 números.");
    if (pin !== pin2) return setErro("Os dois PINs não são iguais.");
    start(async () => {
      const r = await definirPin(token, pin);
      if (!r.ok) return setErro(r.erro ?? "Erro.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-center text-sm text-zinc-500">
        Crie um PIN de 4 números só seu. Você vai usar ele para entrar.
      </p>
      <input
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
        inputMode="numeric"
        placeholder="••••"
        className={box}
      />
      <input
        value={pin2}
        onChange={(e) => setPin2(e.target.value.replace(/\D/g, "").slice(0, 4))}
        inputMode="numeric"
        placeholder="repita o PIN"
        className={box}
      />
      {erro && <p className="text-center text-sm text-red-600">{erro}</p>}
      <button onClick={salvar} disabled={p} className={btn}>
        {p ? "Salvando..." : "Criar meu PIN"}
      </button>
    </div>
  );
}

export function EntrarPin({ token }: { token: string }) {
  const router = useRouter();
  const [p, start] = useTransition();
  const [pin, setPin] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  function entrar() {
    setErro(null);
    start(async () => {
      const r = await entrarPin(token, pin);
      if (!r.ok) return setErro(r.erro ?? "Erro.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-center text-sm text-zinc-500">Digite seu PIN.</p>
      <input
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
        onKeyDown={(e) => e.key === "Enter" && entrar()}
        inputMode="numeric"
        placeholder="••••"
        className={box}
        autoFocus
      />
      {erro && <p className="text-center text-sm text-red-600">{erro}</p>}
      <button onClick={entrar} disabled={p} className={btn}>
        {p ? "Entrando..." : "Entrar"}
      </button>
    </div>
  );
}
