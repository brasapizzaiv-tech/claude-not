"use client";

// Quadro do rodízio na TV da cozinha (32", vista de 3–4 m, luz forte).
//
// Recebe a fila pela rota protegida pela chave: o banco avisa "mudou" pelo
// Realtime e a TV busca na hora; de segurança, a fila a cada 30 s e o resto
// a cada 5 min. Feito pra ficar aberto a noite inteira: timers fixos, sem
// acúmulo de listeners, relógio recalculado a partir do estado (nada cresce).
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { QuadroRodizio } from "@/components/tv-rodizio";
import { TV } from "@/lib/tv-cores";
import { TvPaginaCardapio, TvPontos, totalPaginasTv, type AniversarianteTv, type CardapioTv, type RecadoTv } from "@/components/tv-cardapio";
import { paginaDaRotacao, TV_SEM_PEDIDO_MIN } from "@/lib/dia-cardapio";
import type { ApontamentoTv } from "@/lib/checklists-core";
import type { Feriado } from "@/lib/feriados";
import type { Evento } from "@/lib/eventos";
import { cameraPausada } from "@/lib/tv-camera-regras";
import { filaVisivel, separarColunas, type PedidoRodizio } from "@/lib/rodizio";

const LEVE_MS = 30_000;      // consulta de segurança da fila
const COMPLETO_MS = 300_000; // cardápio, recados, feriados, temperatura...

declare global { interface Window { __tvOk?: boolean } }

export function TvClient({ chave, inicial, agoraInicial, recadosInicial, temperaturaInicial, aniversariantesInicial, cardapioInicial, ultimaAtividadeInicial, apontamentosInicial = [], feriadosInicial = [], eventosInicial = [] }: { chave: string; inicial: PedidoRodizio[]; agoraInicial: number; recadosInicial: RecadoTv[]; temperaturaInicial: number | null; aniversariantesInicial: AniversarianteTv[]; cardapioInicial: CardapioTv; ultimaAtividadeInicial: string | null; apontamentosInicial?: ApontamentoTv[]; feriadosInicial?: Feriado[]; eventosInicial?: Evento[] }) {
  const [aniversariantes, setAniversariantes] = useState<AniversarianteTv[]>(aniversariantesInicial);
  const [cardapio, setCardapio] = useState<CardapioTv>(cardapioInicial);
  const [ultimaAtividade, setUltimaAtividade] = useState<string | null>(ultimaAtividadeInicial);
  const [pedidos, setPedidos] = useState<PedidoRodizio[]>(inicial);
  const [recados, setRecados] = useState<RecadoTv[]>(recadosInicial);
  const [apontamentos, setApontamentos] = useState<ApontamentoTv[]>(apontamentosInicial);
  const [feriados, setFeriados] = useState<Feriado[]>(feriadosInicial);
  const [eventos, setEventos] = useState<Evento[]>(eventosInicial);
  const [temperatura, setTemperatura] = useState<number | null>(temperaturaInicial);
  const [agora, setAgora] = useState(agoraInicial);
  const [conectado, setConectado] = useState(true);
  const [ultimaOk, setUltimaOk] = useState<number>(0);
  const [canal, setCanal] = useState<string | null>(null);
  const buscarRef = useRef<((completo: boolean) => Promise<void>) | null>(null);
  const buscando = useRef(false);

  // Avisa a página que o código ligou (senão ela pula pro modo simples).
  useEffect(() => { window.__tvOk = true; }, []);

  // Busca a fila; nunca sobrepõe duas buscas. Duas consultas: a LEVE (só a
  // fila) roda quando o banco avisa "mudou" pelo Realtime e, por segurança, a
  // cada 30 s; a COMPLETA (cardápio, recados, feriados...) a cada 5 min.
  // Antes era tudo a cada 3 s: 28 mil chamadas e 22 GB por mês.
  useEffect(() => {
    let vivo = true;
    const buscar = async (completo: boolean) => {
      if (buscando.current) return;
      buscando.current = true;
      try {
        const r = await fetch(`/api/tv/fila?chave=${encodeURIComponent(chave)}${completo ? "" : "&modo=leve"}`, { cache: "no-store", signal: AbortSignal.timeout(4000) });
        const j = await r.json();
        if (!vivo) return;
        if (j.ok) {
          // Câmera do buffet entrou no ar: a TV vai pra ela (src/lib/tv-camera.ts).
          if (typeof j.camera === "string" && j.camera.startsWith("http://") && !cameraPausada(new URLSearchParams(window.location.search).get("semcamera"))) {
            window.location.replace(j.camera);
            return;
          }
          setPedidos(j.pedidos as PedidoRodizio[]);
          setUltimaAtividade(typeof j.ultimaAtividade === "string" ? j.ultimaAtividade : null);
          if (!j.leve) {
            if (Array.isArray(j.recados)) setRecados(j.recados as RecadoTv[]);
            if (Array.isArray(j.apontamentos)) setApontamentos(j.apontamentos as ApontamentoTv[]);
            if (Array.isArray(j.feriados)) setFeriados(j.feriados as Feriado[]);
            if (Array.isArray(j.eventos)) setEventos(j.eventos as Evento[]);
            if (Array.isArray(j.aniversariantes)) setAniversariantes(j.aniversariantes as AniversarianteTv[]);
            if (j.cardapio) setCardapio(j.cardapio as CardapioTv);
            setTemperatura(typeof j.temperatura === "number" ? j.temperatura : null);
            if (typeof j.canal === "string") setCanal(j.canal);
          }
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
    buscarRef.current = buscar;
    buscar(true);
    const tLeve = setInterval(() => buscar(false), LEVE_MS);
    const tCompleto = setInterval(() => buscar(true), COMPLETO_MS);
    // Voltou a rede / a aba voltou a ficar visível: busca tudo na hora.
    const tudo = () => buscar(true);
    const acordar = () => { if (document.visibilityState === "visible") tudo(); };
    window.addEventListener("online", tudo);
    document.addEventListener("visibilitychange", acordar);
    return () => {
      vivo = false;
      clearInterval(tLeve);
      clearInterval(tCompleto);
      window.removeEventListener("online", tudo);
      document.removeEventListener("visibilitychange", acordar);
    };
  }, [chave]);

  // O banco avisa "mudou" num canal público do Realtime (migration 0207): a
  // TV busca a fila na hora, sem ficar perguntando. O aviso não traz dado
  // nenhum; a leitura continua pela rota com a chave.
  useEffect(() => {
    if (!canal) return;
    const supabase = createClient();
    let t: ReturnType<typeof setTimeout> | null = null;
    // Canal PRIVADO: aviso vindo do banco só chega assim (migration 0209 libera
    // a leitura do tópico pra qualquer um — o aviso não carrega dado).
    const ch = supabase
      .channel(canal, { config: { private: true } })
      .on("broadcast", { event: "mudou" }, () => {
        // Vários avisos no mesmo segundo (pedido com 3 pizzas) viram uma busca.
        if (t) clearTimeout(t);
        t = setTimeout(() => { t = null; buscarRef.current?.(false); }, 300);
      })
      .subscribe();
    return () => {
      if (t) clearTimeout(t);
      supabase.removeChannel(ch);
    };
  }, [canal]);

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
  const { salgadas, doces } = separarColunas(fila);
  const totalPaginas = totalPaginasTv(apontamentos);
  const pagina = paginaDaRotacao(agora, totalPaginas);
  const semRede = !conectado || (ultimaOk > 0 && agora - ultimaOk > 20000);

  return (
    <div style={{ height: "100vh", background: TV.fundo, color: TV.texto, fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {!mostrarFila ? (
        // Fora do rodízio: tela única — cardápio do dia + hora + saladas + marmitas + aniversários/recados.
        <TvPaginaCardapio key={pagina} cardapio={cardapio} agora={agora} recados={recados} temperatura={temperatura} aniversariantes={aniversariantes} piscar apontamentos={apontamentos} pagina={pagina} feriados={feriados} eventos={eventos} />
      ) : fila.length === 0 ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <p style={{ fontSize: "5.2vh", fontWeight: 800, color: TV.fraco }}>Nenhum pedido</p>
        </div>
      ) : (
        <QuadroRodizio salgadas={salgadas} doces={doces} agora={agora} />
      )}

      {/* rodapé: relógio + conexão */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 24px 14px", fontSize: "1.9vh", color: TV.fraco }}>
        <span style={{ display: "flex", alignItems: "center", gap: 16 }}>Brasa · Rodízio {!mostrarFila && <TvPontos pagina={pagina} total={totalPaginas} />}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            title={semRede ? "Sem conexão" : "Conectado"}
            style={{ width: 14, height: 14, borderRadius: 7, background: semRede ? "#ef4444" : "#22c55e", display: "inline-block", boxShadow: semRede ? "0 0 10px #ef4444" : "0 0 10px #22c55e" }}
          />
          {semRede && <span style={{ color: "#ef4444", fontWeight: 700 }}>SEM CONEXÃO</span>}
          <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700, color: TV.suave }}>
            {new Date(agora).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}
          </span>
        </span>
      </div>
    </div>
  );
}
