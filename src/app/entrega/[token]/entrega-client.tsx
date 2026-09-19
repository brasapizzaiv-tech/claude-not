"use client";

import { Icone, type NomeIcone } from "@/components/icone";

// App do entregador (celular, por link pessoal). Abas: Entregas · Ganhos ·
// Histórico · GPS. Copiado do que funciona no Suit Express: pendente/entregue,
// leitor de QR do cupom pra "pegar" o pedido, "saí com essas", "entreguei"
// com o que recebeu, meus ganhos por forma, histórico por dia, localização.
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import jsQR from "jsqr";
import { historicoEntregas, marcarEntregue, meusGanhos, minhasEntregas, pegarEntrega, registrarPosicao, sairComEntregas, type Boy, type EntregaBoy } from "./entrega-actions";

const LARANJA = "var(--marca-primaria)"; // vem do cadastro da empresa
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const hhmm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }) : "");
const hojeSP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const GPS_INTERVALO_MS = 15000;

// Dentro do app nativo (Capacitor) existe window.Capacitor; aí o GPS vai pelo
// plugin de segundo plano (serviço nativo, funciona com a tela apagada).
type CapGlobal = { isNativePlatform?: () => boolean; registerPlugin: (nome: string) => unknown };
type BgGeo = {
  addWatcher: (opts: { backgroundMessage?: string; backgroundTitle?: string; requestPermissions?: boolean; stale?: boolean; distanceFilter?: number }, cb: (loc: { latitude: number; longitude: number; accuracy?: number } | undefined, err?: { code?: string; message?: string }) => void) => Promise<string>;
  removeWatcher: (o: { id: string }) => Promise<void>;
  openSettings: () => Promise<void>;
};
function capacitorNativo(): CapGlobal | null {
  const c = (typeof window !== "undefined" ? (window as unknown as { Capacitor?: CapGlobal }).Capacitor : undefined) ?? null;
  return c && typeof c.registerPlugin === "function" && c.isNativePlatform?.() ? c : null;
}

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
    rodar(() => sairComEntregas(token, ids), `Saiu com ${ids.length} entrega${ids.length > 1 ? "s" : ""}.`);
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
  const nativo = capacitorNativo() !== null;
  useEffect(() => {
    if (!gpsOn) { wake.current?.release().catch(() => {}); wake.current = null; return; }
    // ---- app nativo: plugin de segundo plano ----
    const cap = capacitorNativo();
    if (cap) {
      let watcherId: string | null = null; let vivo = true;
      const bg = cap.registerPlugin("BackgroundGeolocation") as BgGeo;
      bg.addWatcher(
        { backgroundTitle: "Brasa Entregas", backgroundMessage: "Rastreando sua posição pro restaurante.", requestPermissions: true, stale: false, distanceFilter: 5 },
        (loc, err) => {
          if (!vivo) return;
          if (err) { setGpsErro(err.code === "NOT_AUTHORIZED" ? "Permita a localização \"o tempo todo\" nas configurações do app." : (err.message ?? "Sem sinal de GPS agora.")); return; }
          if (!loc) return;
          const agora = Date.now();
          const p = { lat: loc.latitude, lng: loc.longitude, precisao: loc.accuracy ?? null, em: agora };
          setGps(p); setGpsErro(null);
          if (agora - ultimoEnvio.current >= GPS_INTERVALO_MS) {
            ultimoEnvio.current = agora;
            registrarPosicao(token, p.lat, p.lng, p.precisao).catch(() => {});
          }
        },
      ).then((id) => { if (vivo) watcherId = id; else bg.removeWatcher({ id }).catch(() => {}); }).catch((e: unknown) => setGpsErro(e instanceof Error ? e.message : "Não consegui ligar o GPS nativo."));
      return () => { vivo = false; if (watcherId) bg.removeWatcher({ id: watcherId }).catch(() => {}); };
    }
    // ---- navegador: só com a tela ligada ----
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
    <div className="rounded-cartao border border-borda-forte bg-painel-cartao p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-lg font-bold">#{p.numero ?? "—"} · {p.nome}</div>
          <div className="text-sm text-texto-suave">{p.endereco}</div>
          {p.referencia && <div className="flex items-start gap-1.5 text-sm text-amber-300"><Icone nome="local" tamanho={14} className="mt-0.5" /> {p.referencia}</div>}
          {p.observacao && <div className="flex items-start gap-1.5 text-sm text-texto-suave"><Icone nome="editar" tamanho={14} className="mt-0.5" /> {p.observacao}</div>}
        </div>
        <div className="text-right">
          <div className="text-lg font-bold">{brl(p.total)}</div>
          <div className={`text-xs font-semibold ${p.pago ? "text-emerald-400" : "text-amber-400"}`}>{p.pago ? "já pago" : `receber · ${p.forma_pagamento ?? "?"}`}</div>
          {!p.pago && p.troco_para ? <div className="text-xs text-texto-suave">troco p/ {brl(p.troco_para)}</div> : null}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-sm">
        <a href={mapaUrl(p)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-controle bg-superficie-suave px-3 py-1.5 font-semibold text-sky-300"><Icone nome="mapa" tamanho={14} /> Mapa</a>
        {p.telefone && <a href={`https://wa.me/55${p.telefone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-controle bg-superficie-suave px-3 py-1.5 font-semibold text-emerald-300"><Icone nome="zap" tamanho={14} /> WhatsApp</a>}
        {p.telefone && <a href={`tel:${p.telefone.replace(/\D/g, "")}`} className="rounded-controle bg-superficie-suave px-3 py-1.5 font-semibold text-texto"><Icone nome="telefone" tamanho={15} titulo="Ligar" /></a>}
        <span className="ml-auto self-center text-xs text-texto-fraco">{p.saiu_em ? `saiu ${hhmm(p.saiu_em)}` : p.previsao_em ? `prev. ${hhmm(p.previsao_em)}` : ""}</span>
      </div>
      {acoes}
    </div>
  );

  return (
    // O app do entregador é escuro SEMPRE: ele usa na rua, muitas vezes de
    // noite. Não segue a escolha de tema da pessoa.
    <div data-tema="escuro" className="min-h-screen bg-painel-fundo pb-24 text-texto">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-borda bg-painel-fundo/95 px-4 py-3 backdrop-blur">
        <div>
          <div className="text-xs text-texto-fraco">Brasa · Entregas</div>
          <div className="font-bold">{boy.nome}</div>
        </div>
        <button onClick={() => setScan(true)} className="rounded-cartao px-3 py-2 text-sm font-bold text-white" style={{ background: LARANJA }}><span className="inline-flex items-center gap-1.5"><Icone nome="camera" tamanho={14} /> Ler cupom</span></button>
      </header>

      {msg && <div className="mx-4 mt-3 rounded-cartao bg-superficie-suave px-3 py-2 text-sm">{msg}</div>}

      {aba === "entregas" && (
        <main className="space-y-4 p-4">
          {aCaminho.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-indigo-300"><span className="inline-flex items-center gap-1.5"><Icone nome="entrega" tamanho={15} /> A caminho ({aCaminho.length})</span></h2>
              <div className="space-y-2">
                {aCaminho.map((p) => (
                  <Card key={p.id} p={p} acoes={
                    <button onClick={() => setEntregando(p)} disabled={proc} className="mt-2 w-full rounded-cartao bg-emerald-600 py-3 text-base font-bold text-white disabled:opacity-50">✓ Entreguei</button>
                  } />
                ))}
              </div>
            </section>
          )}
          <section>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-texto-suave"><span className="inline-flex items-center gap-1.5"><Icone nome="pacote" tamanho={15} /> Comigo, esperando sair ({esperando.length})</span></h2>
            {esperando.length === 0 && <p className="text-sm text-texto-fraco">Nada esperando. Leia o QR do cupom ou pegue uma pronta abaixo.</p>}
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
              <button onClick={sair} disabled={proc || sel.size === 0} className="mt-3 w-full rounded-cartao py-3 text-base font-bold text-white disabled:opacity-40" style={{ background: LARANJA }}>
                <Icone nome="entrega" tamanho={16} className="mr-1.5" /> Saí com {sel.size || ""} entrega{sel.size === 1 ? "" : "s"}
              </button>
            )}
          </section>
          {dados.disponiveis.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-emerald-300"><span className="inline-flex items-center gap-1.5"><Icone nome="certo" tamanho={15} /> Prontas sem entregador ({dados.disponiveis.length})</span></h2>
              <div className="space-y-2">
                {dados.disponiveis.map((p) => (
                  <Card key={p.id} p={p} acoes={
                    <button onClick={() => pegar(p.id)} disabled={proc} className="mt-2 w-full rounded-cartao border border-emerald-500 py-2.5 font-bold text-emerald-300 disabled:opacity-50"><span className="inline-flex items-center justify-center gap-1.5"><Icone nome="pessoa" tamanho={15} /> Peguei essa</span></button>
                  } />
                ))}
              </div>
            </section>
          )}
          {dados.entreguesHoje.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-texto-fraco"><span className="inline-flex items-center gap-1.5"><Icone nome="certo" tamanho={15} /> Entregues hoje ({dados.entreguesHoje.length})</span></h2>
              <div className="space-y-1 text-sm text-texto-suave">
                {dados.entreguesHoje.map((p) => (
                  <div key={p.id} className="flex justify-between rounded-controle bg-painel-cartao px-3 py-2">
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
            <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="rounded-controle border border-borda-forte bg-painel-cartao px-2 py-1.5 text-sm" />
          </div>
          {!ganhos ? <p className="text-sm text-texto-fraco">Carregando…</p> : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-cartao bg-painel-cartao p-3"><div className="text-xs text-texto-fraco">Entregas</div><div className="text-2xl font-bold">{ganhos.entregas}</div></div>
                <div className="rounded-cartao bg-painel-cartao p-3"><div className="text-xs text-texto-fraco">Ganhos (teles + fixos)</div><div className="text-2xl font-bold text-emerald-400">{brl(ganhos.teles + ganhos.fixos)}</div></div>
              </div>
              <div className="text-xs text-texto-fraco">Teles {brl(ganhos.teles)} · fixos já acertados {brl(ganhos.fixos)}</div>
              <div>
                <div className="mb-1 text-xs font-bold uppercase tracking-wide text-texto-fraco">Recebido na porta</div>
                <div className="grid grid-cols-3 gap-2">
                  {(["Cartão", "Pix", "Dinheiro"] as const).map((f) => (
                    <div key={f} className="rounded-cartao bg-painel-cartao p-3"><div className="text-xs text-texto-fraco">{f}</div><div className="text-lg font-bold">{brl(ganhos.porForma[f] ?? 0)}</div></div>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-1 text-xs font-bold uppercase tracking-wide text-texto-fraco">Pagamentos efetuados</div>
                {ganhos.acertos.length === 0 && <p className="text-sm text-texto-fraco">Nenhum acerto neste mês.</p>}
                {ganhos.acertos.map((a) => (
                  <div key={a.data} className="flex justify-between rounded-controle bg-painel-cartao px-3 py-2 text-sm">
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
            <button onClick={() => setDia(addDias(dia, -1))} className="rounded-controle bg-painel-cartao px-3 py-1.5">‹</button>
            <span className="font-bold">{new Date(dia + "T12:00:00-03:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone: "America/Sao_Paulo" })}</span>
            <button onClick={() => setDia(addDias(dia, 1))} disabled={dia >= hoje} className="rounded-controle bg-painel-cartao px-3 py-1.5 disabled:opacity-30">›</button>
          </div>
          {!hist ? <p className="text-sm text-texto-fraco">Carregando…</p> : hist.length === 0 ? <p className="py-10 text-center text-texto-fraco">Nenhuma entrega nesse dia.</p> : (
            <div className="space-y-2">
              {hist.map((p) => (
                <div key={p.id} className="rounded-cartao bg-painel-cartao px-3 py-2 text-sm">
                  <div className="flex justify-between font-semibold"><span>#{p.numero} {p.nome}</span><span>{p.status === "entregue" ? `✓ ${hhmm(p.entregue_em)}` : p.status}</span></div>
                  <div className="text-texto-suave">{p.endereco}</div>
                  <div className="text-texto-fraco">{p.recebido_forma ? `${p.recebido_forma}${p.recebido_valor ? ` ${brl(p.recebido_valor)}` : ""}` : ""}{p.taxa_motoboy != null ? ` · tele ${brl(p.taxa_motoboy)}` : ""}</div>
                </div>
              ))}
            </div>
          )}
        </main>
      )}

      {aba === "gps" && (
        <main className="space-y-4 p-4">
          <div className="rounded-cartao bg-painel-cartao p-4">
            <div className="mb-1 flex items-center gap-2 text-lg font-bold"><Icone nome="local" tamanho={18} /> Localização</div>
            <p className="mb-3 text-sm text-texto-suave">
              {nativo
                ? <>Com o rastreamento ligado o restaurante vê onde você está no mapa — <b>mesmo com a tela apagada</b> (fica uma notificação fixa enquanto estiver ativo). Na primeira vez, escolha <b>“Permitir o tempo todo”</b>.</>
                : <>Com o rastreamento ligado o restaurante vê onde você está no mapa. Pelo navegador só funciona com este app <b>aberto na tela</b> (a tela fica acesa sozinha). Instale o app Brasa Entregas pra rastrear em segundo plano.</>}
            </p>
            <button onClick={alternarGps} className={`w-full rounded-cartao py-3 text-base font-bold ${gpsOn ? "bg-emerald-600 text-white" : "bg-superficie-suave text-texto"}`}>
              {gpsOn ? <span className="inline-flex items-center gap-1.5"><Icone nome="certo" tamanho={14} /> Rastreamento ATIVO — tocar pra desligar</span> : "Ligar rastreamento"}
            </button>
            {gpsErro && <p className="mt-2 text-sm text-rose-400">{gpsErro}</p>}
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-cartao bg-painel-cartao p-3"><div className="text-xs text-texto-fraco">Modo</div><div className="font-bold">{nativo ? "App (2º plano)" : "Navegador"} · {GPS_INTERVALO_MS / 1000} s</div></div>
            <div className="rounded-cartao bg-painel-cartao p-3"><div className="text-xs text-texto-fraco">Precisão</div><div className="font-bold">{gps?.precisao != null ? `${Math.round(gps.precisao)} m` : "—"}</div></div>
            <div className="rounded-cartao bg-painel-cartao p-3"><div className="text-xs text-texto-fraco">Latitude</div><div className="font-bold">{gps ? gps.lat.toFixed(5) : "—"}</div></div>
            <div className="rounded-cartao bg-painel-cartao p-3"><div className="text-xs text-texto-fraco">Longitude</div><div className="font-bold">{gps ? gps.lng.toFixed(5) : "—"}</div></div>
            <div className="col-span-2 rounded-cartao bg-painel-cartao p-3"><div className="text-xs text-texto-fraco">Última atualização</div><div className="font-bold">{gps ? new Date(gps.em).toLocaleTimeString("pt-BR") : "—"}</div></div>
          </div>
        </main>
      )}

      {/* barra de abas */}
      <nav className="fixed inset-x-0 bottom-0 grid grid-cols-4 border-t border-borda bg-painel-fundo text-xs">
        {([["entregas", "entrega", "Entregas"], ["ganhos", "dinheiro", "Ganhos"], ["historico", "relogio", "Histórico"], ["gps", "local", "GPS"]] as [Aba, NomeIcone, string][]).map(([k, i, l]) => (
          <button key={k} onClick={() => setAba(k)} className={`flex flex-col items-center py-2.5 ${aba === k ? "text-white" : "text-texto-fraco"}`} style={aba === k ? { color: LARANJA } : {}}>
            <Icone nome={i} tamanho={21} />
            <span className="mt-0.5">{l}</span>
          </button>
        ))}
      </nav>

      {/* modal: entreguei */}
      {entregando && <ModalEntregue p={entregando} proc={proc} onFechar={() => setEntregando(null)} onOk={(forma, valor) => { const p = entregando; setEntregando(null); rodar(() => marcarEntregue(token, p.id, { forma, valor }), "Entrega concluída!"); }} />}
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
      <div className="w-full rounded-t-3xl bg-painel-cartao p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 text-lg font-bold">Entreguei #{p.numero} · {p.nome}</div>
        <div className="mb-3 text-sm text-texto-suave">Total {brl(p.total)}{p.pago ? " · já estava pago" : ""}</div>
        <div className="mb-3 grid grid-cols-2 gap-2">
          {["Dinheiro", "Cartão", "Pix", "Já pago"].map((f) => (
            <button key={f} onClick={() => setForma(f)} className={`rounded-cartao border py-3 font-semibold ${forma === f ? "border-emerald-500 bg-emerald-600 text-white" : "border-borda-forte text-texto-suave"}`}>{f}</button>
          ))}
        </div>
        {forma !== "Já pago" && (
          <div className="mb-3">
            <label className="text-xs text-texto-fraco">Valor recebido (R$)</label>
            <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" className="w-full rounded-cartao border border-borda-forte bg-painel-fundo px-3 py-3 text-xl font-bold" />
          </div>
        )}
        <button onClick={() => onOk(forma, Number(valor.replace(",", ".")) || 0)} disabled={proc} className="w-full rounded-cartao bg-emerald-600 py-3.5 text-base font-bold text-white disabled:opacity-50">✓ Confirmar entrega</button>
        <button onClick={onFechar} className="mt-2 w-full py-2 text-sm text-texto-fraco">cancelar</button>
      </div>
    </div>
  );
}

// Leitor de QR com a câmera: abre a câmera traseira e decodifica os quadros
// com jsQR (funciona em Android e iPhone). Sem câmera/permissão, digita o nº.
function ModalScan({ onFechar, onLido, refManual, setRefManual }: { onFechar: () => void; onLido: (ref: string) => void; refManual: string; setRefManual: (v: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [lendo, setLendo] = useState(false);
  const lidoRef = useRef(false);
  // onLido muda a cada render do pai; guardar em ref evita reabrir a câmera toda hora.
  const onLidoRef = useRef(onLido);
  useEffect(() => { onLidoRef.current = onLido; }, [onLido]);
  useEffect(() => {
    let stream: MediaStream | null = null; let vivo = true; let timer: ReturnType<typeof setInterval> | null = null;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) { setErro("Este navegador não abre a câmera — digite o número do pedido."); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
        if (!vivo || !videoRef.current) return;
        const v = videoRef.current;
        v.srcObject = stream; v.setAttribute("playsinline", "true"); v.muted = true;
        await v.play();
        setLendo(true);
        const canvas = canvasRef.current ?? document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        timer = setInterval(() => {
          if (!vivo || !ctx || lidoRef.current || v.readyState < 2 || !v.videoWidth) return;
          // reduz o quadro pra decodificar rápido
          const esc = Math.min(1, 640 / v.videoWidth);
          canvas.width = Math.round(v.videoWidth * esc); canvas.height = Math.round(v.videoHeight * esc);
          ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
          if (code?.data) { lidoRef.current = true; if (navigator.vibrate) navigator.vibrate(80); onLidoRef.current(code.data); }
        }, 250);
      } catch (e) {
        const nome = e instanceof Error ? e.name : "";
        setErro(nome === "NotAllowedError" ? "Permissão da câmera negada — libere nas configurações do navegador (cadeado ao lado do endereço) ou digite o número."
          : nome === "NotFoundError" ? "Nenhuma câmera encontrada — digite o número do pedido."
          : "Não consegui abrir a câmera — digite o número do pedido.");
      }
    })();
    return () => { vivo = false; if (timer) clearInterval(timer); stream?.getTracks().forEach((t) => t.stop()); };
  }, []);
  return (
    <div className="fixed inset-0 z-20 flex flex-col bg-black">
      <div className="flex items-center justify-between p-3 text-white"><span className="font-bold">{lendo ? "Aponte pro QR do cupom" : "Abrindo a câmera…"}</span><button onClick={onFechar} className="rounded-controle bg-superficie-suave px-3 py-1.5">Fechar</button></div>
      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} className="h-full w-full object-cover" muted playsInline autoPlay />
        <canvas ref={canvasRef} className="hidden" />
        {lendo && <div className="pointer-events-none absolute inset-0 flex items-center justify-center"><div className="h-56 w-56 rounded-cartao border-4 border-white/70" /></div>}
      </div>
      {erro && <p className="px-4 py-2 text-sm text-rose-400">{erro}</p>}
      <div className="flex gap-2 p-3">
        <input value={refManual} onChange={(e) => setRefManual(e.target.value)} inputMode="numeric" placeholder="Nº do pedido (ex.: 412)" className="flex-1 rounded-cartao border border-borda-forte bg-painel-cartao px-3 py-3 text-lg text-white" />
        <button onClick={() => onLido(refManual)} className="rounded-cartao px-4 font-bold text-white" style={{ background: LARANJA }}>Pegar</button>
      </div>
    </div>
  );
}
