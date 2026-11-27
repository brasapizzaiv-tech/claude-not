"use client";
import { Icone } from "@/components/icone";
import { confirmar } from "@/components/dialogo";

// Tablet da cozinha (KDS): pedidos do DELIVERY (o que já foi impresso, com o
// botão "Pronto") e o quadro do RODÍZIO (No forno → Pronto), na mesma tela.
// Cada tablet escolhe o que mostra (Tudo / Delivery / Rodízio) e lembra.
// Realtime do Supabase (usuário logado) + busca a cada 10 s como reserva.
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { RodizioCard } from "@/components/rodizio-card";
import { filaVisivel, separarColunas, minutosDesde, type PedidoRodizio } from "@/lib/rodizio";
import { DELIVERY_ALERTA_MIN, horaAlvo, partesDoItem, separarDelivery, type PedidoCozinha } from "@/lib/cozinha-delivery";
import { avancarRodizio, cancelarRodizio, deliveryPronto, deliveryVoltarPreparo, filaDeliveryCozinha, filaRodizio } from "./actions";
import { TV } from "@/lib/tv-cores";

const ESCALA = 0.8; // tablet: um pouco menor que a TV, pra caber mais
type Modo = "tudo" | "delivery" | "rodizio";
const MODOS: [Modo, string][] = [["tudo", "Tudo"], ["delivery", "Delivery"], ["rodizio", "Rodízio"]];

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

function lerLocal(chave: string): string | null {
  try { return localStorage.getItem(chave); } catch { return null; }
}
function gravarLocal(chave: string, valor: string) {
  try { localStorage.setItem(chave, valor); } catch { /* sem armazenamento */ }
}

// Alerta de pedido novo (WebAudio, sem arquivo). O navegador só toca depois de
// um toque na página — por isso o botão de som no topo.
let audioCtx: AudioContext | null = null;
function tocarAlerta() {
  try {
    audioCtx ??= new AudioContext();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const t0 = audioCtx.currentTime;
    [0, 0.22, 0.44].forEach((dt, i) => {
      const o = audioCtx!.createOscillator(); const g = audioCtx!.createGain();
      o.type = "sine"; o.frequency.value = i === 2 ? 1320 : 880;
      g.gain.setValueAtTime(0.0001, t0 + dt); g.gain.exponentialRampToValueAtTime(0.5, t0 + dt + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.18);
      o.connect(g).connect(audioCtx!.destination); o.start(t0 + dt); o.stop(t0 + dt + 0.2);
    });
  } catch { /* sem áudio */ }
}

export function CozinhaClient({ inicial, inicialDelivery }: { inicial: PedidoRodizio[]; inicialDelivery: PedidoCozinha[] }) {
  const [pedidos, setPedidos] = useState<PedidoRodizio[]>(inicial);
  const [delivery, setDelivery] = useState<PedidoCozinha[]>(inicialDelivery);
  const [agora, setAgora] = useState(() => Date.now());
  const [realtime, setRealtime] = useState(false);
  const [proc, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  // Preferências deste tablet (o que mostra e o som), lembradas no aparelho.
  const [modo, setModo] = useState<Modo>(() => {
    const m = typeof window === "undefined" ? null : lerLocal("cozinha_modo");
    return m === "delivery" || m === "rodizio" ? m : "tudo";
  });
  const [som, setSom] = useState(() => typeof window !== "undefined" && lerLocal("cozinha_som") === "1");
  // Tela cheia: some a barra do navegador. O app instalado já abre assim.
  const [cheia, setCheia] = useState(() =>
    typeof window !== "undefined" && (!!document.fullscreenElement || window.matchMedia?.("(display-mode: fullscreen)").matches === true));
  const buscando = useRef(false);
  const vistos = useRef<Set<string> | null>(null);

  const recarregar = useCallback(async () => {
    if (buscando.current) return;
    buscando.current = true;
    try {
      const [r, d] = await Promise.all([filaRodizio(), filaDeliveryCozinha()]);
      setPedidos(r);
      setDelivery(d);
    } catch { /* sem rede: mantém */ } finally { buscando.current = false; }
  }, []);

  // Realtime: qualquer mudança nas tabelas recarrega (simples e à prova de
  // perder evento). Polling de 10 s cobre se o canal cair.
  useEffect(() => {
    const supabase = createClient();
    const canal = supabase
      .channel("cozinha_kds")
      .on("postgres_changes", { event: "*", schema: "public", table: "pedidos_rodizio" }, () => { recarregar(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "delivery_pedidos" }, () => { recarregar(); })
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

  // Tela do tablet não apaga enquanto a página está aberta (quando o aparelho deixa).
  useEffect(() => {
    let trava: { release: () => Promise<void> } | null = null;
    const pedir = async () => {
      try {
        const wl = (navigator as unknown as { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock;
        if (wl && document.visibilityState === "visible") trava = await wl.request("screen");
      } catch { /* aparelho não deixa */ }
    };
    pedir();
    document.addEventListener("visibilitychange", pedir);
    return () => { document.removeEventListener("visibilitychange", pedir); trava?.release().catch(() => {}); };
  }, []);

  const fila = filaVisivel(pedidos, agora);
  const { salgadas, doces } = separarColunas(fila);
  const { cozinha, depois } = separarDelivery(delivery, agora);
  const abertosDelivery = cozinha.filter((p) => p.status !== "pronto").length;
  const abertosRodizio = fila.filter((p) => p.status !== "pronto").length;

  // Som quando chega coisa nova pra fazer (não toca na primeira carga).
  useEffect(() => {
    const ids = [
      ...cozinha.filter((p) => p.status !== "pronto").map((p) => `d:${p.id}`),
      ...fila.filter((p) => p.status === "pendente").map((p) => `r:${p.id}`),
    ];
    if (vistos.current) {
      const novo = ids.some((id) => !vistos.current!.has(id));
      const importa = ids.some((id) => !vistos.current!.has(id) && (modo === "tudo" || (modo === "delivery" ? id.startsWith("d:") : id.startsWith("r:"))));
      if (novo && importa && som) tocarAlerta();
    }
    vistos.current = new Set([...(vistos.current ?? []), ...ids]);
  }, [cozinha, fila, som, modo]);

  useEffect(() => {
    const mudou = () => setCheia(!!document.fullscreenElement || window.matchMedia?.("(display-mode: fullscreen)").matches === true);
    document.addEventListener("fullscreenchange", mudou);
    return () => document.removeEventListener("fullscreenchange", mudou);
  }, []);
  function telaCheia() {
    document.documentElement.requestFullscreen?.().catch(() => setErro("Este navegador não deixa abrir em tela cheia. Use “Instalar app” no menu ⋮."));
  }

  function escolherModo(m: Modo) { setModo(m); gravarLocal("cozinha_modo", m); }
  function alternarSom() {
    const v = !som;
    setSom(v);
    gravarLocal("cozinha_som", v ? "1" : "0");
    if (v) tocarAlerta(); // toque de teste e libera o áudio no navegador
  }

  function agir(fn: () => Promise<{ ok: boolean; mensagem?: string }>) {
    setErro(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) setErro(r.mensagem ?? "Não deu certo. Confira a internet e tente de novo.");
      await recarregar();
    });
  }

  // ── Rodízio ────────────────────────────────────────────────────────────
  const botaoRodizio = (p: PedidoRodizio, estreito = false) => {
    const larg = estreito ? 112 : 150;
    const letra = estreito ? 19 : 22;
    if (p.status === "pendente") {
      return (
        <button
          onClick={() => agir(() => avancarRodizio(p.id, "forno"))}
          disabled={proc}
          style={{ minHeight: 72, minWidth: larg, borderRadius: 14, background: TV.info, color: TV.fundo, fontSize: letra, fontWeight: 900, border: 0, padding: "0 18px" }}
        >
          <Icone nome="fogo" tamanho={16} className="mr-1.5" /> No forno
        </button>
      );
    }
    if (p.status === "forno") {
      return (
        <button
          onClick={() => agir(() => avancarRodizio(p.id, "pronto"))}
          disabled={proc}
          style={{ minHeight: 72, minWidth: larg, borderRadius: 14, background: TV.ok, color: TV.fundo, fontSize: letra, fontWeight: 900, border: 0, padding: "0 18px" }}
        >
          ✓ Pronto
        </button>
      );
    }
    return <div style={{ minWidth: larg, textAlign: "center", fontSize: 20, fontWeight: 800, color: TV.ok }}>saiu</div>;
  };

  const acoesRodizio = (p: PedidoRodizio, estreito = false) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: 6 }}>
      {botaoRodizio(p, estreito)}
      {(p.status === "pendente" || p.status === "forno") && (
        <button
          onClick={async () => { if (await confirmar(`Cancelar ${p.sabor} da mesa ${p.mesa}?`, { perigo: true, okTexto: "Cancelar o pedido" })) agir(() => cancelarRodizio(p.id)); }}
          disabled={proc}
          style={{ fontSize: 14, color: TV.fraco, background: "transparent", border: 0, textDecoration: "underline", padding: 6, minHeight: 44 }}
        >
          cancelar
        </button>
      )}
    </div>
  );

  const titulo = (texto: string, cor: string, n: number) => (
    <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: "0.12em", color: cor, marginBottom: 8 }}>
      {texto} <span style={{ color: TV.fraco, fontWeight: 700 }}>{n}</span>
    </div>
  );

  const vazio = (texto: string, alto = true) => (
    <div style={{ height: alto ? "60vh" : 120, display: "flex", alignItems: "center", justifyContent: "center", background: alto ? "transparent" : TV.bloco, borderRadius: 16 }}>
      <p style={{ fontSize: alto ? 36 : 20, fontWeight: 800, color: TV.fraco }}>{texto}</p>
    </div>
  );

  // Rodízio em duas colunas (tela só dele) ou numa só (dividindo com o delivery).
  const blocoRodizio = (estreito: boolean) => {
    if (fila.length === 0) return vazio("Nenhuma pizza do rodízio", !estreito);
    if (estreito) {
      return (
        <div>
          {titulo("RODÍZIO", TV.laranja, abertosRodizio)}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {fila.map((p) => <RodizioCard key={p.id} p={p} agora={agora} escala={0.7} acoes={acoesRodizio(p, true)} />)}
          </div>
        </div>
      );
    }
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {([["SALGADAS", TV.laranja, salgadas], ["DOCES", TV.rosa, doces]] as const).map(([t, cor, lista]) => (
          <div key={t}>
            {titulo(t, cor, lista.length)}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {lista.map((p) => <RodizioCard key={p.id} p={p} agora={agora} escala={ESCALA} acoes={acoesRodizio(p)} />)}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // ── Delivery ───────────────────────────────────────────────────────────
  const cartaoDelivery = (p: PedidoCozinha) => {
    const pronto = p.status === "pronto";
    const alvo = horaAlvo(p);
    const passou = !pronto && (alvo ? agora > Date.parse(alvo) : minutosDesde(p.desde, agora) >= DELIVERY_ALERTA_MIN);
    const corTipo = p.tipo === "retirada" ? TV.areia : TV.info;
    const borda = pronto ? TV.ok : passou ? TV.atraso : TV.laranja;
    return (
      <div
        key={p.id}
        style={{
          background: pronto ? "#1c2e20" : TV.bloco,
          borderTop: `10px solid ${borda}`,
          borderRadius: 16,
          padding: 14,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          boxShadow: passou ? `0 0 0 3px ${TV.atraso} inset` : undefined,
          opacity: pronto ? 0.85 : 1,
        }}
      >
        {/* número + tipo + hora */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ fontSize: 46, lineHeight: 1, fontWeight: 900, color: TV.texto, fontVariantNumeric: "tabular-nums" }}>
            {p.numero ?? "—"}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "inline-block", fontSize: 14, fontWeight: 900, letterSpacing: "0.08em", padding: "3px 10px", borderRadius: 999, background: corTipo, color: TV.fundo }}>
              {p.tipo === "retirada" ? "RETIRADA" : "ENTREGA"}
            </span>
            <div style={{ fontSize: 16, color: TV.suave, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nome}</div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            {pronto ? (
              <div style={{ fontSize: 22, fontWeight: 900, color: TV.ok }}>✓ PRONTO</div>
            ) : (
              <>
                <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.08em", color: passou ? TV.atraso : TV.fraco }}>
                  {p.agendado_para ? (p.tipo === "retirada" ? "RETIRA ÀS" : "ENTREGA ÀS") : "PREVISÃO"}
                </div>
                <div style={{ fontSize: 26, fontWeight: 900, color: passou ? TV.atraso : TV.texto, fontVariantNumeric: "tabular-nums" }}>
                  {alvo ? hhmm(alvo) : "—"}
                </div>
                <div style={{ fontSize: 14, color: TV.fraco }}>na cozinha há {minutosDesde(p.desde, agora)} min</div>
              </>
            )}
          </div>
        </div>

        {/* itens, do jeito que saem no papel */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: `1px solid ${TV.borda}`, paddingTop: 10 }}>
          {p.itens.length === 0 && <div style={{ color: TV.fraco }}>Sem itens</div>}
          {p.itens.map((it, i) => {
            const { nome, sabores, linhas } = partesDoItem(it.descricao);
            return (
              <div key={i}>
                <div style={{ fontSize: 21, fontWeight: 900, color: TV.texto, lineHeight: 1.2 }}>
                  <span style={{ color: TV.laranja }}>{it.qtd}×</span> {nome}
                </div>
                {sabores && <div style={{ fontSize: 20, fontWeight: 800, color: TV.texto, lineHeight: 1.25, marginTop: 2 }}>{sabores}</div>}
                {linhas.map((l, j) =>
                  l.tipo === "etapa" ? (
                    <div key={j} style={{ fontSize: 13, fontWeight: 900, letterSpacing: "0.1em", color: TV.areia, marginTop: 6, textTransform: "uppercase" }}>{l.texto}</div>
                  ) : l.tipo === "sabor" ? (
                    <div key={j} style={{ fontSize: 19, fontWeight: 800, color: TV.texto, lineHeight: 1.3, paddingLeft: 10 }}>• {l.texto}</div>
                  ) : l.tipo === "obs" ? (
                    <div key={j} style={{ fontSize: 17, fontWeight: 800, color: TV.atencao, background: TV.atencaoFundo, borderRadius: 10, padding: "4px 8px", marginTop: 4 }}>
                      <Icone nome="alerta" tamanho={16} className="mr-1.5" />{l.texto}
                    </div>
                  ) : (
                    <div key={j} style={{ fontSize: 17, color: TV.texto, lineHeight: 1.3, paddingLeft: 10 }}>• {l.texto}</div>
                  ),
                )}
              </div>
            );
          })}
          {p.observacao && (
            <div style={{ fontSize: 17, fontWeight: 800, color: TV.atencao, background: TV.atencaoFundo, borderRadius: 10, padding: "6px 10px" }}>
              <Icone nome="alerta" tamanho={16} className="mr-1.5" />Pedido: {p.observacao}
            </div>
          )}
        </div>

        {/* ação */}
        <div style={{ marginTop: "auto" }}>
          {pronto ? (
            <button
              onClick={() => agir(() => deliveryVoltarPreparo(p.id))}
              disabled={proc}
              style={{ width: "100%", minHeight: 48, borderRadius: 14, background: "transparent", color: TV.suave, fontSize: 16, fontWeight: 800, border: `2px solid ${TV.borda}` }}
            >
              <Icone nome="desfazer" tamanho={16} className="mr-1.5" /> Toquei errado: voltar
            </button>
          ) : (
            <button
              onClick={() => agir(() => deliveryPronto(p.id))}
              disabled={proc}
              style={{ width: "100%", minHeight: 68, borderRadius: 14, background: TV.ok, color: TV.fundo, fontSize: 24, fontWeight: 900, border: 0 }}
            >
              ✓ Pronto
            </button>
          )}
        </div>
      </div>
    );
  };

  // Agendados que ainda não foram pra cozinha: só pra saber o que vem.
  const faixaDepois = depois.length > 0 && (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
      <span style={{ fontSize: 14, fontWeight: 900, letterSpacing: "0.1em", color: TV.fraco }}>
        <Icone nome="relogio" tamanho={15} className="mr-1.5" />MAIS TARDE
      </span>
      {depois.map((p) => (
        <span key={p.id} style={{ background: TV.bloco, border: `1px solid ${TV.borda}`, borderRadius: 999, padding: "6px 12px", fontSize: 15, color: TV.suave }}>
          <b style={{ color: TV.texto, fontVariantNumeric: "tabular-nums" }}>{p.agendado_para ? hhmm(p.agendado_para) : "—"}</b>
          {" "}· nº {p.numero ?? "—"} · {p.tipo === "retirada" ? "retirada" : "entrega"} · {p.itens.reduce((s, i) => s + i.qtd, 0)} {p.itens.reduce((s, i) => s + i.qtd, 0) === 1 ? "item" : "itens"}
        </span>
      ))}
    </div>
  );

  const blocoDelivery = (colunaMin: number) => (
    <div>
      {titulo("DELIVERY", TV.info, abertosDelivery)}
      {faixaDepois}
      {cozinha.length === 0
        ? vazio("Nenhum pedido do delivery na cozinha", false)
        : (
          <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${colunaMin}px, 1fr))`, gap: 14, alignItems: "stretch" }}>
            {cozinha.map(cartaoDelivery)}
          </div>
        )}
    </div>
  );

  // No "Tudo": quem não tem pedido encolhe, pra sobrar tela pro outro.
  const conteudo = () => {
    if (modo === "delivery") return blocoDelivery(300);
    if (modo === "rodizio") return blocoRodizio(false);
    const temD = cozinha.length > 0 || depois.length > 0;
    const temR = fila.length > 0;
    if (!temD && !temR) return vazio("Nenhum pedido");
    if (temD && !temR) return <>{blocoDelivery(300)}<p style={{ marginTop: 14, color: TV.fraco, fontSize: 15 }}>Rodízio: nenhuma pizza agora.</p></>;
    if (!temD && temR) return <>{blocoRodizio(false)}<p style={{ marginTop: 14, color: TV.fraco, fontSize: 15 }}>Delivery: nenhum pedido na cozinha.</p></>;
    return (
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 3fr) minmax(0, 2fr)", gap: 18, alignItems: "start" }}>
        {blocoDelivery(260)}
        {blocoRodizio(true)}
      </div>
    );
  };

  const contador = (m: Modo) => (m === "delivery" ? abertosDelivery : m === "rodizio" ? abertosRodizio : abertosDelivery + abertosRodizio);

  return (
    <div style={{ minHeight: "100vh", background: TV.fundo, color: TV.texto, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: "0.08em", color: TV.laranja }}>
          <Icone nome="cozinha" tamanho={22} className="mr-2" /> COZINHA
        </span>
        <div role="tablist" aria-label="O que mostrar" style={{ display: "flex", gap: 8 }}>
          {MODOS.map(([m, rot]) => {
            const ativo = modo === m;
            const n = contador(m);
            return (
              <button
                key={m}
                role="tab"
                aria-selected={ativo}
                onClick={() => escolherModo(m)}
                style={{ minHeight: 48, padding: "0 18px", borderRadius: 999, border: `2px solid ${ativo ? TV.texto : TV.borda}`, background: ativo ? TV.texto : TV.bloco, color: ativo ? TV.fundo : TV.texto, fontSize: 17, fontWeight: 800 }}
              >
                {rot}
                {n > 0 && <span style={{ marginLeft: 8, background: TV.laranja, color: TV.fundo, borderRadius: 999, padding: "1px 9px", fontSize: 15 }}>{n}</span>}
              </button>
            );
          })}
        </div>
        <span style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 16, color: TV.fraco }}>
          {!cheia && (
            <button
              onClick={telaCheia}
              style={{ minHeight: 48, padding: "0 14px", borderRadius: 999, border: `2px solid ${TV.borda}`, background: TV.bloco, color: TV.suave, fontSize: 15, fontWeight: 800 }}
            >
              <Icone nome="tela" tamanho={16} className="mr-1.5" />Tela cheia
            </button>
          )}
          <button
            onClick={alternarSom}
            aria-pressed={som}
            style={{ minHeight: 48, padding: "0 14px", borderRadius: 999, border: `2px solid ${som ? TV.ok : TV.borda}`, background: TV.bloco, color: som ? TV.ok : TV.suave, fontSize: 15, fontWeight: 800 }}
          >
            <Icone nome={som ? "som" : "mudo"} tamanho={16} className="mr-1.5" />{som ? "Som ligado" : "Ligar som"}
          </button>
          <span style={{ width: 12, height: 12, borderRadius: 6, background: realtime ? TV.ok : TV.aviso, display: "inline-block" }} />
          {realtime ? "ao vivo" : "atualizando a cada 10 s"}
          {/* O servidor desenha a hora e o tablet acerta logo depois: na virada do minuto os dois diferem (normal), sem refazer a tela. */}
          <span suppressHydrationWarning style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700, color: TV.suave, fontSize: 20 }}>
            {hhmm(new Date(agora).toISOString())}
          </span>
        </span>
      </div>
      {erro && <p role="alert" style={{ color: TV.atraso, fontWeight: 700, marginBottom: 8 }}>{erro}</p>}
      {conteudo()}
    </div>
  );
}
