"use client";

// Escuta as teclas rápidas (src/lib/atalhos.ts) em qualquer tela do painel.
// Tecla de função não escreve nada, então vale até com o cursor num campo.
// A tela de destino continua conferindo a permissão de quem apertou.
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ATALHOS } from "@/lib/atalhos";

export function AtalhosTeclado() {
  const router = useRouter();
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey || e.repeat) return;
      const a = ATALHOS.find((x) => x.tecla === e.key);
      if (!a) return;
      e.preventDefault();
      if (window.location.pathname !== a.href) router.push(a.href);
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [router]);
  return null;
}
