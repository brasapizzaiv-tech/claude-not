"use client";

// "Sair deste aparelho" dos apps Motelli (Equipe e Entregador) e do link no
// navegador. Pedido do Rafael (13/10/2026): depois de entrar, não tinha como
// voltar pra tela do código — celular emprestado, código errado, ou pessoa
// desligada (o link salvo vira "Link inválido" e o app ficava preso nele).
//
// Dentro do app, o endereço salvo mora na tela de entrada (outra origem: a
// página local do app), então a gente volta pra ela com ?sair=1 e ela mesma
// esquece o endereço (www/index.html). No navegador, só esquece o PIN.
import { useState } from "react";

function telaDoApp(): string | null {
  const w = window as unknown as { androidBridge?: unknown; webkit?: { messageHandlers?: { bridge?: unknown } } };
  if (w.androidBridge) return "https://localhost/?sair=1";
  if (w.webkit?.messageHandlers?.bridge) return "capacitor://localhost/?sair=1";
  return null;
}

export function SairDoAparelho({ aoSair, className = "" }: { aoSair?: () => Promise<unknown>; className?: string }) {
  const [saindo, setSaindo] = useState(false);
  async function sair() {
    if (saindo) return;
    if (!window.confirm("Sair deste aparelho? Pra entrar de novo vai precisar do código (ou do link) e do PIN.")) return;
    setSaindo(true);
    try { await aoSair?.(); } catch { /* sem conexão: no app, voltar pro código resolve igual */ }
    const app = telaDoApp();
    if (app) window.location.replace(app);
    else window.location.reload();
  }
  return (
    <button type="button" onClick={sair} disabled={saindo} className={`text-sm text-texto-fraco underline hover:text-texto disabled:opacity-50 ${className}`}>
      {saindo ? "Saindo…" : "Sair deste aparelho"}
    </button>
  );
}
