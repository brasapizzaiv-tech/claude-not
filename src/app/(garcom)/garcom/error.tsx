"use client";
import { Icone } from "@/components/icone";

// Tela de erro do app do garçom: em vez de travar, mostra o aviso e deixa
// tentar de novo (o carrinho da tela anterior se perde, mas o app não morre).
export default function GarcomErro({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-painel-fundo p-6 text-center text-texto">
      <div className="flex justify-center"><Icone nome="alerta" tamanho={52} className="text-amber-500" /></div>
      <p className="text-lg font-bold">Deu um erro aqui</p>
      <p className="text-sm text-texto-suave">Pode ser a internet. Tente de novo; se continuar, avise o caixa.</p>
      <button onClick={reset} className="rounded-cartao bg-emerald-600 px-6 py-3 font-semibold text-white">Tentar de novo</button>
      <a href="/garcom" className="text-sm text-blue-400">Voltar pro início</a>
    </div>
  );
}
