"use client";

// App do entregador (celular, por link pessoal). Abas: Entregas · Ganhos ·
// Histórico · GPS. Copiado do que funciona no Suit Express: pendente/entregue,
// leitor de QR do cupom pra "pegar" o pedido, "saí com essas", "entreguei"
// com o que recebeu, meus ganhos por forma, histórico por dia, localização.
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { historicoEntregas, marcarEntregue, meusGanhos, minhasEntregas, pegarEntrega, registrarPosicao, sairComEntregas, type Boy, type EntregaBoy } from "./entrega-actions";

const LARANJA = "#C78340";
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const hhmm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }) : "");
const hojeSP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const GPS_INTERVALO_MS = 15000;

type Dados = NonNullable<Awaited<ReturnType<typeof minhasEntregas>>>;
type Aba = "entregas" | "ganhos" | "historico" | "gps";

export function EntregaClient({ token, boy, inicial }: { token: string; boy: Boy; inicial: Dados }) {
  const [aba, setAba] = useState<Aba>("entregas");
  const [dados, setDados] = useState<Dados>(inicial);
  const [proc, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [entregando, setEntregando] = useState<EntregaBoy | null>(null);
  const [scan, setScan] = useState(false);
  const [refManual, setRefManual] = useState("");

  const recarregar = useCallback(async () => {
    try { const d = await minhasEntregas(token); if (d) setDados(d); } catch { /* sem rede */ }
  }, [token]);
  useEffect(() => {
    const t = setInterval(recarregar, 10000);
    const acordar = () => { if (document.visibilityState === "visible") recarregar(); };
    document.addEventListener("visibilitychange", acordar);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", acordar); };
  }, [recarregar]);

  function rodar(fn: () => Promise<{ ok: boolean; mensagem?: string }>, okMsg?: string) {
    setMsg(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) setMsg(r.mensagem ?? "Não deu certo.");
      else if (okMsg) setMsg(okMsg);
      await recarregar();
      if (r.ok) setTimeout(() => setMsg(null), 3000);
    });
  }
  function pegar(ref: string) {
    if (!ref.trim()) return;
    rodar(() => pegarEntrega(token, ref), "✓ Pedido vinculado a você.");
    setRefManual(""); setScan(false);
  }
  function sair() {
    const ids = [...sel];
    rodar(() => sairComEntregas(token, ids), `🛵 Saiu com ${ids.length} entrega${ids.length > 1 ? "s" : ""}.`);
    setSel(new Set());
  }

  // ---------- GPS ----------
  const [gpsOn, setGpsOn] = useState(false);
  const [gps, setGps] = useState<{ lat: number; lng: number; precisao: number | null; em: number } | null>(null);
  const [gpsErro, setGpsErro] = useState<string | null>(null);
  const ultimoEnvio = useRef(0);
  const wake = useRef<{ release: () => Promise<void> } | null>(null);
  useEffect(() => {
    // Lembrado por aparelho; liga depois da hidratação (por isso o timeout).
    let ligado = false;
    try { ligado = localStorage.getItem("entrega_gps") === "1"; } catch { /* sem storage */ }
    const t = setTimeout(() => { if (ligado) setGpsOn(true); }, 0);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (!gpsOn) { wake.current?.release().catch(() => {}); wake.current = null; return; }
    const geo = navigator.geolocation;
    if (!geo) { const t = setTimeout(() => setGpsErro("Este celular não tem GPS disponível no navegador."), 0); return () => clearTimeout(t); }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const agora = Date.now();
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude, precisao: pos.coords.accuracy ?? null, em: agora };
        setGps(p); setGpsErro(null);
        if (agora - ultimoEnvio.current >= GPS_INTERVALO_MS) {
          ultimoEnvio.current = agora;
          registrarPosicao(token, p.lat, p.lng, p.precisao).catch(() => {});
        }
      },
      (e) => setGpsErro(e.code === 1 ? "Permissão de localização negada — libere nas configurações do navegador." : "Sem sinal de GPS agora."),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    // Tela ligada enquanto rastreia (o navegador não manda posição com a tela apagada).
    (async () => { try { const n = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }; wake.current = (await n.wakeLock?.request("screen")) ?? null; } catch { /* sem wake lock */ } })();
    return () => { navigator.geolocation.clearWatch(id); wake.current?.release().catch(() => {}); wake.current = null; };
  }, [gpsOn, token]);
  function alternarGps() {
    const v = !gpsOn; setGpsOn(v);
    try { localStorage.setItem("entrega_gps", v ? "1" : "0"); } catch { /* sem storage */ }
  }

  // ---------- Ganhos / Histórico ----------
  const hoje = hojeSP();
  const [mes, setMes] = useState(hoje.slice(0, 7));
  const [ganhos, setGanhos] = useState<Awaited<ReturnType<typeof meusGanhos>>>(null);
  useEffect(() => {
    if (aba !== "ganhos") return;
    const [a, m] = mes.split("-").map(Number);
    meusGanhos(token, a, m).then(setGanhos).catch(() => setGanhos(null));
  }, [aba, mes, token]);
  const [dia, setDia] = useState(hoje);
  const [hist, setHist] = useState<EntregaBoy[] | null>(null);
  useEffect(() => {
    if (aba !== "historico") return;
    historicoEntregas(token, dia).then(setHist).catch(() => setHist(null));
  }, [aba, dia, token]);
  const addDias = (iso: string, n: number) => { const [a, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10); };

  const aCaminho = dados.minhas.filter((p) => p.status === "saiu");
  const esperando = dados.minhas.filter((p) => p.status !== "saiu");
  const mapaUrl = (p: EntregaBoy) => p.lat != null && p.lng != null
    ? `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.endereco)}`;

  const Card = ({ p, acoes }: { p: EntregaBoy; acoes?: React.ReactNode }) => (
    <div className="rounded-2xl border border-zinc-700 bg-zinc-900 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-lg font-bold">#{p.numero ?? "—"} · {p.nome}</div>
          <div className="text-sm text-zinc-300">{p.endereco}</div>
          {p.referencia && <div className="text-sm text-amber-300">📍 {p.referencia}</div>}
          {p.observacao && <div className="text-sm text-zinc-400">📝 {p.observacao}</div>}
        </div>
        <div className="text-right">
          <div className="text-lg font-bold">{brl(p.total)}</div>
          <div className={`text-xs font-semibold ${p.pago ? "text-emerald-400" : "text-amber-400"}`}>{p.pago ? "já pago" : `receber · ${p.forma_pagamento ?? "?"}`}</div>
          {!p.pago && p.troco_para ? <div className="text-xs text-zinc-400">troco p/ {brl(p.troco_para)}</div> : null}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-sm">
        <a href={mapaUrl(p)} target="_blank" rel="noreferrer" className="rounded-lg bg-zinc-800 px-3 py-1.5 font-semibold text-sky-300">🗺️ Mapa</a>
        {p.telefone && <a href={`https://wa.me/55${p.telefone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="rounded-lg bg-zinc-800 px-3 py-1.5 font-semibold text-emerald-300">💬 WhatsApp</a>}
        {p.telefone && <a href={`tel:${p.telefone.replace(/\D/g, "")}`} className="rounded-lg bg-zinc-800 px-3 py-1.5 font-semibold text-zinc-200">📞</a>}
        <span className="ml-auto self-center text-xs text-zinc-500">{p.saiu_em ? `saiu ${hhmm(p.saiu_em)}` : p.previsao_em ? `prev. ${hhmm(p.previsao_em)}` : ""}</span>
      </div>
      {acoes}
    </div>
  );

  return (
    <div className="min-h-screen bg-zinc-950 pb-24 text-zinc-50">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-800 bg-zinc-950/95 px-4 py-3 backdrop-blur">
        <div>
          <div className="text-xs text-zinc-500">Brasa · Entregas</div>
          <div className="font-bold">{boy.nome}</div>
        </div>
        <button onClick={() => setScan(true)} className="rounded-xl px-3 py-2 text-sm font-bold text-white" style={{ background: LARANJA }}>📷 Ler cupom</button>
      </header>

      {msg && <div className="mx-4 mt-3 rounded-xl bg-zinc-800 px-3 py-2 text-sm">{msg}</div>}

      {aba === "entregas" && (
        <main className="space-y-4 p-4">
          {aCaminho.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-indigo-300">🛵 A caminho ({aCaminho.length})</h2>
              <div className="space-y-2">
                {aCaminho.map((p) => (
                  <Card key={p.id} p={p} acoes={
                    <button onClick={() => setEntregando(p)} disabled={proc} className="mt-2 w-full rounded-xl bg-emerald-600 py-3 text-base font-bold text-white disabled:opacity-50">✓ Entreguei</button>
                  } />
                ))}
              </div>
            </section>
          )}
          <section>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-zinc-400">📦 Comigo, esperando sair ({esperando.length})</h2>
            {esperando.length === 0 && <p className="text-sm text-zinc-500">Nada esperando. Leia o QR do cupom ou pegue uma pronta abaixo.</p>}
            <div className="space-y-2">
              {esperando.map((p) => (
                <label key={p.id} className="block">
                  <Card p={p} acoes={
                    <div className="mt-2 flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={sel.has(p.id)} onChange={(e) => setSel((s) => { const n = new Set(s); if (e.target.checked) n.add(p.id); else n.delete(p.id); return n; })} className="h-5 w-5" />
                      <span>{p.status === "pronto" ? "Pronto na bancada" : "Ainda na cozinha"} — marcar pra sair</span>
                    </div>
                  } />
                </label>
              ))}
            </div>
            {esperando.length > 0 && (
              <button onClick={sair} disabled={proc || sel.size === 0} className="mt-3 w-full rounded-xl py-3 text-base font-bold text-white disabled:opacity-40" style={{ background: LARANJA }}>
                🛵 Saí com {sel.size || ""} entrega{sel.size === 1 ? "" : "s"}
              </button>
            )}
          </section>
          {dados.disponiveis.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-emerald-300">✅ Prontas sem entregador ({dados.disponiveis.length})</h2>
              <div className="space-y-2">
                {dados.disponiveis.map((p) => (
                  <Card key={p.id} p={p} acoes={
                    <button onClick={() => pegar(p.id)} disabled={proc} className="mt-2 w-full rounded-xl border border-emerald-500 py-2.5 font-bold text-emerald-300 disabled:opacity-50">🙋 Peguei essa</button>
                  } />
                ))}
              </div>
            </section>
          )}
          {dados.entreguesHoje.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-zinc-500">🎉 Entregues hoje ({dados.entreguesHoje.length})</h2>
              <div className="space-y-1 text-sm text-zinc-400">
                {dados.entreguesHoje.map((p) => (
                  <div key={p.id} className="flex justify-between rounded-lg bg-zinc-900 px-3 py-2">
                    <span>#{p.numero} {p.nome} · {hhmm(p.entregue_em)}</span>
                    <span>{p.recebido_forma === "Já pago" ? "já pago" : `${p.recebido_forma ?? ""} ${p.recebido_valor != null ? brl(p.recebido_valor) : ""}`}{p.taxa_motoboy != null ? ` · +${brl(p.taxa_motoboy)}` : ""}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </main>
      )}

      {aba === "ganhos" && (
        <main className="space-y-4 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Meus ganhos</h2>
            <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm" />
          </div>
          {!ganhos ? <p className="text-sm text-zinc-500">Carregando…</p> : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-2xl bg-zinc-900 p-3"><div className="text-xs text-zinc-500">Entregas</div><div className="text-2xl font-bold">{ganhos.entregas}</div></div>
                <div className="rounded-2xl bg-zinc-900 p-3"><div className="text-xs text-zinc-500">Ganhos (teles + fixos)</div><div className="text-2xl font-bold text-emerald-400">{brl(ganhos.teles + ganhos.fixos)}</div></div>
              </div>
              <div className="text-xs text-zinc-500">Teles {brl(ganhos.teles)} · fixos já acertados {brl(ganhos.fixos)}</div>
              <div>
                <div className="mb-1 text-xs font-bold uppercase tracking-wide text-zinc-500">Recebido na porta</div>
                <div className="grid grid-cols-3 gap-2">
                  {(["Cartão", "Pix", "Dinheiro"] as const).map((f) => (
                    <div key={f} className="rounded-2xl bg-zinc-900 p-3"><div className="text-xs text-zinc-500">{f}</div><div className="text-lg font-bold">{brl(ganhos.porForma[f] ?? 0)}</div></div>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-1 text-xs font-bold uppercase tracking-wide text-zinc-500">Pagamentos efetuados</div>
                {ganhos.acertos.length === 0 && <p className="text-sm text-zinc-500">Nenhum acerto neste mês.</p>}
                {ganhos.acertos.map((a) => (
                  <div key={a.data} className="flex justify-between rounded-lg bg-zinc-900 px-3 py-2 text-sm">
                    <span>{a.data.split("-").reverse().join("/")} · {a.teles_qtd} tele{a.teles_qtd === 1 ? "" : "s"}</span>
                    <span className="font-bold text-emerald-400">{brl(a.total)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </main>
      )}

      {aba === "historico" && (
        <main className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <button onClick={() => setDia(addDias(dia, -1))} className="rounded-lg bg-zinc-900 px-3 py-1.5">‹</button>
            <span className="font-bold">{new Date(dia + "T12:00:00-03:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone: "America/Sao_Paulo" })}</span>
            <button onClick={() => setDia(addDias(dia, 1))} disabled={dia >= hoje} className="rounded-lg bg-zinc-900 px-3 py-1.5 disabled:opacity-30">›</button>
          </div>
          {!hist ? <p className="text-sm text-zinc-500">Carregando…</p> : hist.length === 0 ? <p className="py-10 text-center text-zinc-500">Nenhuma entrega nesse dia.</p> : (
            <div className="space-y-2">
              {hist.map((p) => (
                <div key={p.id} className="rounded-xl bg-zinc-900 px-3 py-2 text-sm">
                  <div className="flex justify-between font-semibold"><span>#{p.numero} {p.nome}</span><span>{p.status === "entregue" ? `✓ ${hhmm(p.entregue_em)}` : p.status}</span></div>
                  <div className="text-zinc-400">{p.endereco}</div>
                  <div className="text-zinc-500">{p.recebido_forma ? `${p.recebido_forma}${p.recebido_valor ? ` ${brl(p.recebido_valor)}` : ""}` : ""}{p.taxa_motoboy != null ? ` · tele ${brl(p.taxa_motoboy)}` : ""}</div>
                </div>
              ))}
            </div>
          )}
        </main>
      )}

      {aba === "gps" && (
        <main className="space-y-4 p-4">
          <div className="rounded-2xl bg-zinc-900 p-4">
            <div className="mb-1 text-lg font-bold">📍 Localização</div>
            <p className="mb-3 text-sm text-zinc-400">Com o rastreamento ligado o restaurante vê onde você está no mapa. Só funciona com este app <b>aberto na tela</b> (a tela fica acesa sozinha).</p>
            <button onClick={alternarGps} className={`w-full rounded-xl py-3 text-base font-bold ${gpsOn ? "bg-emerald-600 text-white" : "bg-zinc-800 text-zinc-200"}`}>
              {gpsOn ? "✅ Rastreamento ATIVO — tocar pra desligar" : "Ligar rastreamento"}
            </button>
            {gpsErro && <p className="mt-2 text-sm text-rose-400">{gpsErro}</p>}
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-2xl bg-zinc-900 p-3"><div className="text-xs text-zinc-500">Intervalo</div><div className="font-bold">{GPS_INTERVALO_MS / 1000} segundos</div></div>
            <div className="rounded-2xl bg-zinc-900 p-3"><div className="text-xs text-zinc-500">Precisão</div><div className="font-bold">{gps?.precisao != null ? `${Math.round(gps.precisao)} m` : "—"}</div></div>
            <div className="rounded-2xl bg-zinc-900 p-3"><div className="text-xs text-zinc-500">Latitude</div><div className="font-bold">{gps ? gps.lat.toFixed(5) : "—"}</div></div>
            <div className="rounded-2xl bg-zinc-900 p-3"><div className="text-xs text-zinc-500">Longitude</div><div className="font-bold">{gps ? gps.lng.toFixed(5) : "—"}</div></div>
            <div className="col-span-2 rounded-2xl bg-zinc-900 p-3"><div className="text-xs text-zinc-500">Última atualização</div><div className="font-bold">{gps ? new Date(gps.em).toLocaleTimeString("pt-BR") : "—"}</div></div>
          </div>
        </main>
      )}

      {/* barra de abas */}
      <nav className="fixed inset-x-0 bottom-0 grid grid-cols-4 border-t border-zinc-800 bg-zinc-950 text-xs">
        {([["entregas", "🛵", "Entregas"], ["ganhos", "💰", "Ganhos"], ["historico", "🕓", "Histórico"], ["gps", gpsOn ? "🟢" : "📍", "GPS"]] as const).map(([k, i, l]) => (
          <button key={k} onClick={() => setAba(k)} className={`flex flex-col items-center py-2.5 ${aba === k ? "text-white" : "text-zinc-500"}`} style={aba === k ? { color: LARANJA } : {}}>
            <span className="text-xl">{i}</span>{l}
          </button>
        ))}
      </nav>

      {/* modal: entreguei */}
      {entregando && <ModalEntregue p={entregando} proc={proc} onFechar={() => setEntregando(null)} onOk={(forma, valor) => { const p = entregando; setEntregando(null); rodar(() => marcarEntregue(token, p.id, { forma, valor }), "🎉 Entrega concluída!"); }} />}
      {/* modal: ler QR */}
      {scan && <ModalScan onFechar={() => setScan(false)} onLido={pegar} refManual={refManual} setRefManual={setRefManual} />}
    </div>
  );
}

function ModalEntregue({ p, proc, onFechar, onOk }: { p: EntregaBoy; proc: boolean; onFechar: () => void; onOk: (forma: string, valor: number) => void }) {
  const [forma, setForma] = useState(p.pago ? "Já pago" : (p.forma_pagamento && ["Dinheiro", "Cartão", "Pix"].includes(p.forma_pagamento) ? p.forma_pagamento : "Dinheiro"));
  const [valor, setValor] = useState(String(p.total.toFixed(2)).replace(".", ","));
  return (
    <div className="fixed inset-0 z-20 flex items-end bg-black/70" onClick={onFechar}>
      <div className="w-full rounded-t-3xl bg-zinc-900 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 text-lg font-bold">Entreguei #{p.numero} · {p.nome}</div>
        <div className="mb-3 text-sm text-zinc-400">Total {brl(p.total)}{p.pago ? " · já estava pago" : ""}</div>
        <div className="mb-3 grid grid-cols-2 gap-2">
          {["Dinheiro", "Cartão", "Pix", "Já pago"].map((f) => (
            <button key={f} onClick={() => setForma(f)} className={`rounded-xl border py-3 font-semibold ${forma === f ? "border-emerald-500 bg-emerald-600 text-white" : "border-zinc-700 text-zinc-300"}`}>{f}</button>
          ))}
        </div>
        {forma !== "Já pago" && (
          <div className="mb-3">
            <label className="text-xs text-zinc-500">Valor recebido (R$)</label>
            <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-xl font-bold" />
          </div>
        )}
        <button onClick={() => onOk(forma, Number(valor.replace(",", ".")) || 0)} disabled={proc} className="w-full rounded-xl bg-emerald-600 py-3.5 text-base font-bold text-white disabled:opacity-50">✓ Confirmar entrega</button>
        <button onClick={onFechar} className="mt-2 w-full py-2 text-sm text-zinc-500">cancelar</button>
      </div>
    </div>
  );
}

// Leitor de QR com a câmera (BarcodeDetector — Chrome no Android). Sem
// suporte, digita o nº do pedido.
function ModalScan({ onFechar, onLido, refManual, setRefManual }: { onFechar: () => void; onLido: (ref: string) => void; refManual: string; setRefManual: (v: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  type Detector = { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
  type WinBD = { BarcodeDetector?: new (o: { formats: string[] }) => Detector };
  // O modal só abre depois de um toque (nunca no servidor): dá pra decidir na hora.
  const [suporta] = useState<boolean>(() => typeof window !== "undefined" && !!(window as unknown as WinBD).BarcodeDetector && !!navigator.mediaDevices?.getUserMedia);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    if (!suporta) return;
    const W = window as unknown as WinBD;
    let stream: MediaStream | null = null; let vivo = true; let timer: ReturnType<typeof setInterval> | null = null;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (!vivo || !videoRef.current) return;
        videoRef.current.srcObject = stream; await videoRef.current.play();
        const det = new W.BarcodeDetector!({ formats: ["qr_code"] });
        timer = setInterval(async () => {
          if (!videoRef.current || !vivo) return;
          try { const cods = await det.detect(videoRef.current); if (cods[0]?.rawValue) { onLido(cods[0].rawValue); } } catch { /* frame ruim */ }
        }, 500);
      } catch { setErro("Não consegui abrir a câmera — libere a permissão ou digite o número."); }
    })();
    return () => { vivo = false; if (timer) clearInterval(timer); stream?.getTracks().forEach((t) => t.stop()); };
  }, [onLido, suporta]);
  return (
    <div className="fixed inset-0 z-20 flex flex-col bg-black">
      <div className="flex items-center justify-between p-3 text-white"><span className="font-bold">Aponte pro QR do cupom</span><button onClick={onFechar} className="rounded-lg bg-zinc-800 px-3 py-1.5">Fechar</button></div>
      {suporta && <video ref={videoRef} className="w-full flex-1 object-cover" muted playsInline />}
      {!suporta && <p className="p-4 text-sm text-zinc-300">Este navegador não lê QR pela câmera. Digite o número do pedido abaixo.</p>}
      {erro && <p className="px-4 text-sm text-rose-400">{erro}</p>}
      <div className="flex gap-2 p-3">
        <input value={refManual} onChange={(e) => setRefManual(e.target.value)} inputMode="numeric" placeholder="Nº do pedido (ex.: 412)" className="flex-1 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-3 text-lg text-white" />
        <button onClick={() => onLido(refManual)} className="rounded-xl px-4 font-bold text-white" style={{ background: LARANJA }}>Pegar</button>
      </div>
    </div>
  );
}
