"use client";

// Tela de erro do app do garçom: em vez de travar, mostra o aviso e deixa
// tentar de novo (o carrinho da tela anterior se perde, mas o app não morre).
export default function GarcomErro({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-zinc-950 p-6 text-center text-zinc-100">
      <div className="text-5xl">⚠️</div>
      <p className="text-lg font-bold">Deu um erro aqui</p>
      <p className="text-sm text-zinc-400">Pode ser a internet. Tente de novo; se continuar, avise o caixa.</p>
      <button onClick={reset} className="rounded-xl bg-emerald-600 px-6 py-3 font-semibold text-white">Tentar de novo</button>
      <a href="/garcom" className="text-sm text-blue-400">Voltar pro início</a>
    </div>
  );
}
