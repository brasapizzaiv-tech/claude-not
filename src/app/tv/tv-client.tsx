"use client";

// Quadro do rodízio na TV da cozinha (32", vista de 3–4 m, luz forte).
//
// Consulta a fila a cada 3 s pela rota protegida pela chave. Feito pra ficar
// aberto a noite inteira: um único timer, sem acúmulo de listeners, e o
// relógio/tempo de espera recalculados a partir do estado atual (nada cresce).
import { useEffect, useRef, useState } from "react";
import { RodizioCard } from "@/components/rodizio-card";
import { type AniversarianteTv, type RecadoTv } from "@/components/tv-relogio";
import { TvPaginaCardapio, TvPontos, type CardapioTv } from "@/components/tv-cardapio";
import { paginaDaRotacao, TV_SEM_PEDIDO_MIN } from "@/lib/dia-cardapio";
import { CARDS_POR_COLUNA, filaVisivel, separarColunas, type PedidoRodizio } from "@/lib/rodizio";

const INTERVALO_MS = 3000;

declare global { interface Window { __tvOk?: boolean } }

export function TvClient({ chave, inicial, agoraInicial, recadosInicial, temperaturaInicial, aniversariantesInicial, cardapioInicial, ultimaAtividadeInicial }: { chave: string; inicial: PedidoRodizio[]; agoraInicial: number; recadosInicial: RecadoTv[]; temperaturaInicial: number | null; aniversariantesInicial: AniversarianteTv[]; cardapioInicial: CardapioTv; ultimaAtividadeInicial: string | null }) {
  const [aniversariantes, setAniversariantes] = useState<AniversarianteTv[]>(aniversariantesInicial);
  const [cardapio, setCardapio] = useState<CardapioTv>(cardapioInicial);
  const [ultimaAtividade, setUltimaAtividade] = useState<string | null>(ultimaAtividadeInicial);
  const [pedidos, setPedidos] = useState<PedidoRodizio[]>(inicial);
  const [recados, setRecados] = useState<RecadoTv[]>(recadosInicial);
  const [temperatura, setTemperatura] = useState<number | null>(temperaturaInicial);
  const [agora, setAgora] = useState(agoraInicial);
  const [conectado, setConectado] = useState(true);
  const [ultimaOk, setUltimaOk] = useState<number>(0);
  const buscando = useRef(false);

  // Avisa a página que o código ligou (senão ela pula pro modo simples).
  useEffect(() => { window.__tvOk = true; }, []);

  // Busca a fila; nunca sobrepõe duas buscas.
  useEffect(() => {
    let vivo = true;
    const buscar = async () => {
      if (buscando.current) return;
      buscando.current = true;
      try {
        const r = await fetch(`/api/tv/fila?chave=${encodeURIComponent(chave)}`, { cache: "no-store", signal: AbortSignal.timeout(4000) });
        const j = await r.json();
        if (!vivo) return;
        if (j.ok) {
          setPedidos(j.pedidos as PedidoRodizio[]);
          if (Array.isArray(j.recados)) setRecados(j.recados as RecadoTv[]);
          if (Array.isArray(j.aniversariantes)) setAniversariantes(j.aniversariantes as AniversarianteTv[]);
          if (j.cardapio) setCardapio(j.cardapio as CardapioTv);
          setUltimaAtividade(typeof j.ultimaAtividade === "string" ? j.ultimaAtividade : null);
          setTemperatura(typeof j.temperatura === "number" ? j.temperatura : null);
          setConectado(true);
          setUltimaOk(Date.now());
        } else {
          setConectado(false);
        }
      } catch {
        if (vivo) setConectado(false);
      } finally {
        buscando.current = false;
      }
    };
    buscar();
    const t = setInterval(buscar, INTERVALO_MS);
    // Voltou a rede / a aba voltou a ficar visível: busca na hora.
    const acordar = () => { if (document.visibilityState === "visible") buscar(); };
    window.addEventListener("online", buscar);
    document.addEventListener("visibilitychange", acordar);
    return () => {
      vivo = false;
      clearInterval(t);
      window.removeEventListener("online", buscar);
      document.removeEventListener("visibilitychange", acordar);
    };
  }, [chave]);

  // Relógio de 1 s pro tempo de espera e pra sumir os "pronto" no prazo.
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const fila = filaVisivel(pedidos, agora);
  // A fila tem prioridade: com pedido aberto, ou até TV_SEM_PEDIDO_MIN depois da
  // última mexida, fica na fila; senão roda as páginas de cardápio.
  const ultimaMs = ultimaAtividade ? Date.parse(ultimaAtividade) : 0;
  const mostrarFila = fila.length > 0 || (ultimaMs > 0 && agora - ultimaMs < TV_SEM_PEDIDO_MIN * 60000);
  const pagina = paginaDaRotacao(agora);
  const { salgadas, doces } = separarColunas(fila);
  const semRede = !conectado || (ultimaOk > 0 && agora - ultimaOk > 20000);

  return (
    <div style={{ minHeight: "100vh", background: "#0b0b0b", color: "#fff", fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {!mostrarFila ? (
        // Fora do rodízio: cardápio do dia → saladas → Kern → relógio/recados.
        <TvPaginaCardapio key={pagina} pagina={pagina} cardapio={cardapio} agora={agora} recados={recados} temperatura={temperatura} aniversariantes={aniversariantes} piscar />
      ) : fila.length === 0 ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <p style={{ fontSize: 56, fontWeight: 800, color: "#555" }}>Nenhum pedido</p>
        </div>
      ) : (
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, padding: "20px 24px 0" }}>
          <Coluna titulo="SALGADAS" cor="#C78340" lista={salgadas} agora={agora} />
          <Coluna titulo="DOCES" cor="#f472b6" lista={doces} agora={agora} />
        </div>
      )}

      {/* rodapé: relógio + conexão */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 24px 14px", fontSize: 20, color: "#777" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 16 }}>Brasa · Rodízio {!mostrarFila && <TvPontos pagina={pagina} />}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            title={semRede ? "Sem conexão" : "Conectado"}
            style={{ width: 14, height: 14, borderRadius: 7, background: semRede ? "#ef4444" : "#22c55e", display: "inline-block", boxShadow: semRede ? "0 0 10px #ef4444" : "0 0 10px #22c55e" }}
          />
          {semRede && <span style={{ color: "#ef4444", fontWeight: 700 }}>SEM CONEXÃO</span>}
          <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700, color: "#aaa" }}>
            {new Date(agora).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}
          </span>
        </span>
      </div>
    </div>
  );
}

function Coluna({ titulo, cor, lista, agora }: { titulo: string; cor: string; lista: PedidoRodizio[]; agora: number }) {
  const visiveis = lista.slice(0, CARDS_POR_COLUNA);
  const resto = lista.length - visiveis.length;
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 12 }}>
        <span style={{ fontSize: 30, fontWeight: 900, letterSpacing: "0.12em", color: cor }}>{titulo}</span>
        <span style={{ fontSize: 22, fontWeight: 700, color: "#777" }}>{lista.length}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {visiveis.map((p) => <RodizioCard key={p.id} p={p} agora={agora} />)}
      </div>
      {resto > 0 && (
        <div style={{ marginTop: 12, textAlign: "center", fontSize: 26, fontWeight: 800, color: cor }}>+{resto} na fila</div>
      )}
    </div>
  );
}
