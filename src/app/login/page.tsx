"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// O logo aqui fica fixo de propósito: antes de entrar, o sistema ainda não
// sabe de qual empresa é a pessoa. Num dia com várias empresas, quem decide
// isso é o endereço (subdomínio), não o cadastro.
export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: senha,
    });
    if (error) {
      setErro("E-mail ou senha incorretos.");
      setCarregando(false);
      return;
    }
    // Volta pra página que a pessoa estava tentando abrir (só caminhos internos).
    const next = new URLSearchParams(window.location.search).get("next") || "";
    router.push(next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
    router.refresh();
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-painel-fundo px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-brasa.png"
            alt="Brasa Restaurante & Pizzaria"
            className="mx-auto mb-4 h-28 w-28 object-contain"
          />
          <h1 className="text-xl font-bold text-texto">
            Motelli
          </h1>
          <p className="mt-1 text-sm text-zinc-500">Entre para continuar</p>
        </div>

        <form
          onSubmit={entrar}
          className="space-y-4 rounded-cartao border border-borda bg-painel-cartao p-6 shadow-sm"
        >
          <div>
            <label className="mb-1 block text-sm font-medium text-texto-suave">
              E-mail
            </label>
            <input aria-label="voce@email.com"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-controle border border-borda-forte bg-painel-cartao px-3 py-2 text-texto focus:border-orange-500"
              placeholder="voce@email.com"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-texto-suave">
              Senha
            </label>
            <input aria-label="••••••••"
              type="password"
              required
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="w-full rounded-controle border border-borda-forte bg-painel-cartao px-3 py-2 text-texto focus:border-orange-500"
              placeholder="••••••••"
            />
          </div>

          {erro && (
            <p role="alert" className="rounded-controle bg-red-50 px-3 py-2 text-sm text-urgente-texto dark:bg-red-950 dark:text-red-400">
              {erro}
            </p>
          )}

          <button
            type="submit"
            disabled={carregando}
            className="w-full rounded-controle bg-primaria px-4 py-2.5 font-medium text-marca-sobre-primaria transition hover:brightness-105 disabled:opacity-60"
          >
            {carregando ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
