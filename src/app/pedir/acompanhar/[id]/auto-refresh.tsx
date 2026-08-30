"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Recarrega a página de acompanhamento a cada 20s enquanto o pedido está ativo.
export function AutoRefresh({ ativo }: { ativo: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!ativo) return;
    const t = setInterval(() => router.refresh(), 20000);
    return () => clearInterval(t);
  }, [ativo, router]);
  return null;
}
