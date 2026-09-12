"use client";

// Tablet da cozinha: a mesma fila da TV, com botão grande de ação por card.
// Realtime do Supabase (usuário logado) + busca a cada 10 s como reserva.
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { RodizioCard } from "@/components/rodizio-card";
import { filaVisivel, separarColunas, type PedidoRodizio } from "@/lib/rodizio";
import { avancarRodizio, cancelarRodizio, filaRodizio } from "./actions";

const ESCALA = 0.8; // tablet: um pouco menor que a TV, pra caber mais

export function CozinhaClient({ inicial }: { inicial: PedidoRodizio[] }) {
  const [pedidos, setPedidos] = useState<PedidoRodizio[]>(inicial);
  const [agora, setAgora] = useState(() => Date.now());
  const [realtime, setRealtime] = useState(false);
  const [proc, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const buscando = useRef(false);

  const recarregar = useCallback(async () => {
    if (buscando.current) return;
    buscando.current = true;
    try { setPedidos(await filaRodizio()); } catch { /* sem rede: mantém */ } finally { buscando.current = false; }
  }, []);

  // Realtime: qualquer mudança na tabela recarrega a fila (simples e à prova
  // de perder evento). Polling de 10 s cobre se o canal cair.
  useEffect(() => {
    const supabase = createClient();
    const canal = supabase
      .channel("pedidos_rodizio_cozinha")
      .on("postgres_changes", { event: "*", schema: "public", table: "pedidos_rodizio" }, () => { recarregar(); })
      .subscribe((status) => setRealtime(status === "SUBSCRIBED"));
    const t = setInterval(recarregar, 10000);
    const acordar = () => { if (document.visibilityState === "visible") recarregar(); };
    document.addEventListener("visibilitychange", acordar);
    window.addEventListener("online", recarregar);
    return () => {
      supabase.removeChannel(canal);
      clearInterval(t);
      document.removeEventListener("visibilitychange", acordar);
      window.removeEventListener("online", recarregar);
    };
  }, [recarregar]);

  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  function agir(fn: () => Promise<{ ok: boolean; mensagem?: string }>) {
    setErro(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) setErro(r.mensagem ?? "não deu certo");
      await recarregar();
    });
  }

  const fila = filaVisivel(pedidos, agora);
  const { salgadas, doces } = separarColunas(fila);

  const botao = (p: PedidoRodizio) => {
    if (p.status === "pendente") {
      return (
        <button
          onClick={() => agir(() => avancarRodizio(p.id, "forno"))}
          disabled={proc}
          style={{ minHeight: 72, minWidth: 150, borderRadius: 14, background: "#3b82f6", color: "#fff", fontSize: 22, fontWeight: 900, border: 0, padding: "0 18px" }}
        >
          🔥 No forno
        </button>
      );
    }
    if (p.status === "forno") {
      return (
        <button
          onClick={() => agir(() => avancarRodizio(p.id, "pronto"))}
          disabled={proc}
          style={{ minHeight: 72, minWidth: 150, borderRadius: 14, background: "#22c55e", color: "#fff", fontSize: 22, fontWeight: 900, border: 0, padding: "0 18px" }}
        >
          ✓ Pronto
        </button>
      );
    }
    return <div style={{ minWidth: 150, textAlign: "center", fontSize: 20, fontWeight: 800, color: "#22c55e" }}>saiu</div>;
  };

  const acoes = (p: PedidoRodizio) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: 6 }}>
      {botao(p)}
      {(p.status === "pendente" || p.status === "forno") && (
        <button
          onClick={() => { if (confirm(`Cancelar ${p.sabor} da mesa ${p.mesa}?`)) agir(() => cancelarRodizio(p.id)); }}
          disabled={proc}
          style={{ fontSize: 13, color: "#999", background: "transparent", border: 0, textDecoration: "underline", padding: 6 }}
        >
          cancelar
        </button>
      )}
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#0b0b0b", color: "#fff", padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: "0.08em", color: "#C78340" }}>🍕 RODÍZIO · COZINHA</span>
        <span style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 16, color: "#888" }}>
          <span style={{ width: 12, height: 12, borderRadius: 6, background: realtime ? "#22c55e" : "#f59e0b", display: "inline-block" }} />
          {realtime ? "ao vivo" : "atualizando a cada 10 s"}
          <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700, color: "#bbb" }}>
            {new Date(agora).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </span>
      </div>
      {erro && <p style={{ color: "#ef4444", fontWeight: 700, marginBottom: 8 }}>{erro}</p>}

      {fila.length === 0 ? (
        <div style={{ height: "70vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <p style={{ fontSize: 40, fontWeight: 800, color: "#555" }}>Nenhum pedido</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {[["SALGADAS", "#C78340", salgadas], ["DOCES", "#f472b6", doces]].map(([titulo, cor, lista]) => (
            <div key={titulo as string}>
              <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: "0.12em", color: cor as string, marginBottom: 8 }}>
                {titulo as string} <span style={{ color: "#777", fontWeight: 700 }}>{(lista as PedidoRodizio[]).length}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {(lista as PedidoRodizio[]).map((p) => (
                  <RodizioCard key={p.id} p={p} agora={agora} escala={ESCALA} acoes={acoes(p)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
