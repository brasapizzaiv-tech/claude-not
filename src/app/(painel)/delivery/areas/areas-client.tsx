"use client";

import { Icone } from "@/components/icone";
import { confirmar } from "@/components/dialogo";

// Editor de áreas de entrega (Leaflet + OpenStreetMap, sem chave): clica no
// mapa pra ir marcando os cantos da área; salva com nome, cor e valor. Embaixo,
// as promoções da taxa (grátis / % / R$) por área, dia, horário e mínimo.
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { AreaEntrega, PromoTele } from "@/lib/delivery-areas";
import { alternarArea, alternarPromoTele, excluirArea, excluirPromoTele, salvarArea, salvarPromoTele } from "./actions";

const CORES = ["#C78340", "#2563eb", "#059669", "#e11d48", "#7c3aed", "#d97706", "#0891b2", "#db2777", "#65a30d", "#78716c"];
const DIAS = [["1", "Seg"], ["2", "Ter"], ["3", "Qua"], ["4", "Qui"], ["5", "Sex"], ["6", "Sáb"], ["0", "Dom"]] as const;
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const inp = "rounded-controle border border-borda-forte bg-transparent px-2 py-1.5 text-sm outline-none ";

type Rascunho = { id: string | null; nome: string; cor: string; valor: string; taxaMotoboy: string; tempoMin: string; pontos: [number, number][] };
const vazio = (cor: string): Rascunho => ({ id: null, nome: "", cor, valor: "", taxaMotoboy: "", tempoMin: "", pontos: [] });

export function AreasClient({ areasIniciais, promosIniciais, origem }: { areasIniciais: AreaEntrega[]; promosIniciais: PromoTele[]; origem: { lat: number; lng: number } | null }) {
  const router = useRouter();
  const [proc, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [rasc, setRasc] = useState<Rascunho>(() => vazio(CORES[areasIniciais.length % CORES.length]));
  const rascRef = useRef(rasc);
  useEffect(() => { rascRef.current = rasc; }, [rasc]);

  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const camadaAreas = useRef<L.LayerGroup | null>(null);
  const camadaRasc = useRef<L.LayerGroup | null>(null);

  // Mapa (uma vez). Clique = novo canto da área em edição.
  useEffect(() => {
    if (!divRef.current || mapRef.current) return;
    const centro: [number, number] = origem ? [origem.lat, origem.lng] : [-29.591, -51.16];
    const map = L.map(divRef.current).setView(centro, 14);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map);
    if (origem) L.circleMarker(centro, { radius: 8, color: "#C78340", fillColor: "#C78340", fillOpacity: 1 }).addTo(map).bindTooltip("Restaurante");
    camadaAreas.current = L.layerGroup().addTo(map);
    camadaRasc.current = L.layerGroup().addTo(map);
    map.on("click", (e: L.LeafletMouseEvent) => {
      setRasc((r) => ({ ...r, pontos: [...r.pontos, [Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6))]] }));
    });
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 100);
  }, [origem]);

  // Áreas salvas (redesenha quando a lista muda).
  useEffect(() => {
    const g = camadaAreas.current; if (!g) return;
    g.clearLayers();
    for (const a of areasIniciais) {
      if (!Array.isArray(a.poligono) || a.poligono.length < 3) continue;
      L.polygon(a.poligono as L.LatLngExpression[], { color: a.cor, weight: 2, fillOpacity: a.ativo ? 0.18 : 0.05, dashArray: a.ativo ? undefined : "4 4" })
        .addTo(g)
        .bindTooltip(`${a.nome} · ${brl(Number(a.valor))}${a.ativo ? "" : " (desligada)"}`);
    }
  }, [areasIniciais]);

  // Rascunho em edição.
  useEffect(() => {
    const g = camadaRasc.current; if (!g) return;
    g.clearLayers();
    for (const p of rasc.pontos) L.circleMarker(p, { radius: 5, color: rasc.cor, fillColor: "#fff", fillOpacity: 1, weight: 2 }).addTo(g);
    if (rasc.pontos.length >= 2) L.polyline(rasc.pontos, { color: rasc.cor, weight: 2, dashArray: "6 4" }).addTo(g);
    if (rasc.pontos.length >= 3) L.polygon(rasc.pontos, { color: rasc.cor, weight: 2, fillOpacity: 0.25 }).addTo(g);
  }, [rasc]);

  function editar(a: AreaEntrega) {
    setRasc({ id: a.id, nome: a.nome, cor: a.cor, valor: String(a.valor), taxaMotoboy: a.taxa_motoboy != null ? String(a.taxa_motoboy) : "", tempoMin: a.tempo_min != null ? String(a.tempo_min) : "", pontos: a.poligono });
    if (mapRef.current && a.poligono.length >= 3) mapRef.current.fitBounds(L.latLngBounds(a.poligono as L.LatLngExpression[]), { padding: [30, 30] });
  }
  function salvar() {
    setMsg(null);
    start(async () => {
      const r = await salvarArea({ id: rasc.id, nome: rasc.nome, cor: rasc.cor, valor: Number(rasc.valor.replace(",", ".")) || 0, taxaMotoboy: rasc.taxaMotoboy ? Number(rasc.taxaMotoboy.replace(",", ".")) : null, tempoMin: rasc.tempoMin ? Number(rasc.tempoMin) : null, poligono: rasc.pontos });
      if (!r.ok) { setMsg(r.mensagem); return; }
      setMsg(`✓ Área "${rasc.nome}" salva.`);
      setRasc(vazio(CORES[(areasIniciais.length + 1) % CORES.length]));
      router.refresh();
    });
  }
  function rodar(fn: () => Promise<{ ok: boolean; mensagem?: string }>) {
    setMsg(null);
    start(async () => { const r = await fn(); if (!r.ok) setMsg(r.mensagem ?? "não deu certo"); router.refresh(); });
  }

  // ---------- promoções ----------
  const [pNome, setPNome] = useState(""); const [pTipo, setPTipo] = useState<PromoTele["tipo"]>("gratis"); const [pValor, setPValor] = useState("");
  const [pAreas, setPAreas] = useState<Set<string>>(new Set()); const [pMin, setPMin] = useState(""); const [pDias, setPDias] = useState<Set<number>>(new Set());
  const [pIni, setPIni] = useState(""); const [pFim, setPFim] = useState(""); const [pVal, setPVal] = useState(""); const [pId, setPId] = useState<string | null>(null);
  function limparPromo() { setPId(null); setPNome(""); setPTipo("gratis"); setPValor(""); setPAreas(new Set()); setPMin(""); setPDias(new Set()); setPIni(""); setPFim(""); setPVal(""); }
  function editarPromo(p: PromoTele) {
    setPId(p.id); setPNome(p.nome); setPTipo(p.tipo); setPValor(String(p.valor || "")); setPAreas(new Set(p.area_ids ?? [])); setPMin(p.pedido_minimo != null ? String(p.pedido_minimo) : "");
    setPDias(new Set(p.dias ?? [])); setPIni(p.hora_ini ?? ""); setPFim(p.hora_fim ?? ""); setPVal(p.validade ?? "");
  }
  function salvarPromo() {
    rodar(async () => {
      const r = await salvarPromoTele({ id: pId, nome: pNome, tipo: pTipo, valor: Number(pValor.replace(",", ".")) || 0, areaIds: pAreas.size ? [...pAreas] : null, pedidoMinimo: pMin ? Number(pMin.replace(",", ".")) : null, dias: pDias.size ? [...pDias] : null, horaIni: pIni || null, horaFim: pFim || null, validade: pVal || null });
      if (r.ok) limparPromo();
      return r;
    });
  }
  const nomeArea = (id: string) => areasIniciais.find((a) => a.id === id)?.nome ?? "?";
  const descPromo = (p: PromoTele) => [
    p.tipo === "gratis" ? "Entrega grátis" : p.tipo === "percent" ? `${p.valor}% de desconto` : `${brl(Number(p.valor))} de desconto`,
    p.area_ids?.length ? `em ${p.area_ids.map(nomeArea).join(", ")}` : "em todas as áreas",
    p.pedido_minimo != null ? `pedidos acima de ${brl(Number(p.pedido_minimo))}` : null,
    p.dias?.length ? p.dias.map((d) => ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][d]).join("/") : "todos os dias",
    p.hora_ini && p.hora_fim ? `${p.hora_ini}–${p.hora_fim}` : null,
    p.validade ? `até ${p.validade.split("-").reverse().join("/")}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
      <div className="space-y-4">
        {/* área em edição */}
        <div className="rounded-cartao border border-borda p-3">
          <div className="mb-2 text-sm font-bold">{rasc.id ? "Editando área" : "Nova área"} <span className="font-normal text-texto-suave">— clique no mapa pra marcar os cantos ({rasc.pontos.length} ponto{rasc.pontos.length === 1 ? "" : "s"})</span></div>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <input value={rasc.nome} onChange={(e) => setRasc({ ...rasc, nome: e.target.value })} placeholder="Nome (ex.: Ivoti Central)" className={inp} />
            <input type="color" value={rasc.cor} onChange={(e) => setRasc({ ...rasc, cor: e.target.value })} className="h-9 w-12 cursor-pointer rounded-controle border border-borda-forte" title="Cor no mapa" />
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <div><label className="text-mini text-texto-suave">Taxa cliente (R$)</label><input value={rasc.valor} onChange={(e) => setRasc({ ...rasc, valor: e.target.value })} inputMode="decimal" placeholder="6,00" className={`${inp} w-full`} /></div>
            <div><label className="text-mini text-texto-suave">Motoboy (R$)</label><input value={rasc.taxaMotoboy} onChange={(e) => setRasc({ ...rasc, taxaMotoboy: e.target.value })} inputMode="decimal" placeholder="opcional" className={`${inp} w-full`} /></div>
            <div><label className="text-mini text-texto-suave">Tempo (min)</label><input value={rasc.tempoMin} onChange={(e) => setRasc({ ...rasc, tempoMin: e.target.value })} inputMode="numeric" placeholder="opcional" className={`${inp} w-full`} /></div>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button onClick={salvar} disabled={proc || rasc.pontos.length < 3 || rasc.nome.trim().length < 2} className="rounded-controle bg-texto px-3 py-1.5 text-sm font-semibold text-fundo disabled:opacity-40">{rasc.id ? "Salvar alterações" : "Salvar área"}</button>
            <button onClick={() => setRasc({ ...rasc, pontos: rasc.pontos.slice(0, -1) })} disabled={rasc.pontos.length === 0} className="rounded-controle border border-borda-forte px-3 py-1.5 text-sm disabled:opacity-40">↶ Desfazer ponto</button>
            <button onClick={() => setRasc(vazio(rasc.cor))} className="rounded-controle px-3 py-1.5 text-sm text-texto-suave underline">limpar</button>
          </div>
          {msg && <p className="mt-2 text-xs text-texto-suave">{msg}</p>}
        </div>

        {/* lista */}
        <div className="divide-y divide-zinc-100 rounded-cartao border border-borda dark:divide-zinc-800">
          {areasIniciais.length === 0 && <p className="p-4 text-center text-sm text-texto-fraco">Nenhuma área ainda — a taxa segue por km.</p>}
          {areasIniciais.map((a) => (
            <div key={a.id} className={`flex items-center gap-2 p-2.5 ${a.ativo ? "" : "opacity-50"}`}>
              <span className="h-6 w-1.5 rounded" style={{ background: a.cor }} />
              <button onClick={() => editar(a)} className="min-w-0 flex-1 text-left">
                <div className="truncate text-sm font-medium">{a.nome}</div>
                <div className="text-mini text-texto-suave">{brl(Number(a.valor))}{a.taxa_motoboy != null ? ` · boy ${brl(Number(a.taxa_motoboy))}` : ""}{a.tempo_min ? ` · ${a.tempo_min} min` : ""}{a.ativo ? "" : " · desligada"}</div>
              </button>
              <button onClick={() => rodar(() => alternarArea(a.id, !a.ativo))} disabled={proc} className="rounded-controle border border-borda-forte px-2 py-1 text-mini">{a.ativo ? "Desligar" : "Ligar"}</button>
              <button onClick={async () => { if (await confirmar(`Apagar a área "${a.nome}"?`)) rodar(() => excluirArea(a.id)); }} disabled={proc} className="px-1 text-texto-fraco hover:text-red-600"><Icone nome="lixeira" tamanho={15} titulo="Apagar" /></button>
            </div>
          ))}
        </div>

        {/* promoções */}
        <div className="rounded-cartao border border-borda p-3">
          <div className="mb-2 flex items-center gap-1.5 text-sm font-bold"><Icone nome="etiqueta" tamanho={14} /> Promoções da tele</div>
          <div className="space-y-2">
            <input value={pNome} onChange={(e) => setPNome(e.target.value)} placeholder="Nome (ex.: Quarta tele grátis)" className={`${inp} w-full`} />
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <select value={pTipo} onChange={(e) => setPTipo(e.target.value as PromoTele["tipo"])} className={inp}>
                <option value="gratis">Entrega grátis</option>
                <option value="percent">Desconto em %</option>
                <option value="valor">Desconto em R$</option>
              </select>
              {pTipo !== "gratis" && <input value={pValor} onChange={(e) => setPValor(e.target.value)} inputMode="decimal" placeholder={pTipo === "percent" ? "%" : "R$"} className={`${inp} w-24`} />}
            </div>
            <div>
              <div className="text-mini text-texto-suave">Áreas (nenhuma marcada = todas)</div>
              <div className="flex flex-wrap gap-1.5">
                {areasIniciais.map((a) => (
                  <button key={a.id} type="button" onClick={() => setPAreas((s) => { const n = new Set(s); if (n.has(a.id)) n.delete(a.id); else n.add(a.id); return n; })} className={`rounded-full border px-2 py-0.5 text-xs ${pAreas.has(a.id) ? "border-emerald-600 bg-texto text-fundo" : "border-borda-forte"}`}>{a.nome}</button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-mini text-texto-suave">Dias (nenhum = todos)</div>
              <div className="flex flex-wrap gap-1.5">
                {DIAS.map(([v, l]) => (
                  <button key={v} type="button" onClick={() => setPDias((s) => { const n = new Set(s); const d = Number(v); if (n.has(d)) n.delete(d); else n.add(d); return n; })} className={`rounded-full border px-2 py-0.5 text-xs ${pDias.has(Number(v)) ? "border-emerald-600 bg-texto text-fundo" : "border-borda-forte"}`}>{l}</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="text-mini text-texto-suave">Pedido mínimo (R$)</label><input value={pMin} onChange={(e) => setPMin(e.target.value)} inputMode="decimal" placeholder="qualquer" className={`${inp} w-full`} /></div>
              <div><label className="text-mini text-texto-suave">Válida até</label><input type="date" value={pVal} onChange={(e) => setPVal(e.target.value)} className={`${inp} w-full`} /></div>
              <div><label className="text-mini text-texto-suave">Das (opcional)</label><input type="time" value={pIni} onChange={(e) => setPIni(e.target.value)} className={`${inp} w-full`} /></div>
              <div><label className="text-mini text-texto-suave">Até</label><input type="time" value={pFim} onChange={(e) => setPFim(e.target.value)} className={`${inp} w-full`} /></div>
            </div>
            <div className="flex gap-2">
              <button onClick={salvarPromo} disabled={proc || pNome.trim().length < 2} className="rounded-controle bg-texto px-3 py-1.5 text-sm font-semibold text-fundo disabled:opacity-40">{pId ? "Salvar" : "Criar promoção"}</button>
              {pId && <button onClick={limparPromo} className="text-sm text-texto-suave underline">cancelar</button>}
            </div>
          </div>
          <div className="mt-3 divide-y divide-borda">
            {promosIniciais.map((p) => (
              <div key={p.id} className={`flex items-center gap-2 py-2 ${p.ativo ? "" : "opacity-50"}`}>
                <button onClick={() => editarPromo(p)} className="min-w-0 flex-1 text-left">
                  <div className="text-sm font-medium">{p.nome}{p.ativo ? "" : " (desligada)"}</div>
                  <div className="text-mini text-texto-suave">{descPromo(p)}</div>
                </button>
                <button onClick={() => rodar(() => alternarPromoTele(p.id, !p.ativo))} disabled={proc} className="rounded-controle border border-borda-forte px-2 py-1 text-mini">{p.ativo ? "Desligar" : "Ligar"}</button>
                <button onClick={async () => { if (await confirmar(`Apagar "${p.nome}"?`)) rodar(() => excluirPromoTele(p.id)); }} disabled={proc} className="px-1 text-texto-fraco hover:text-red-600"><Icone nome="lixeira" tamanho={15} titulo="Apagar" /></button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div ref={divRef} className="h-[70vh] min-h-[480px] w-full overflow-hidden rounded-cartao bg-painel-cartao" />
    </div>
  );
}
