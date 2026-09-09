"use client";

// Mapa dos pedidos ativos no GOOGLE MAPS (visual que o Rafael conhece: rua,
// satélite, Street View). Usa a chave de NAVEGADOR (GOOGLE_MAPS_BROWSER_KEY),
// que é pública por natureza e deve estar restrita ao domínio do sistema e à
// "Maps JavaScript API". Sem a chave, o board cai no OpenStreetMap (mapa.tsx).
import { useEffect, useRef, useState } from "react";
import type { PinoPedido } from "./mapa";

const COR: Record<string, string> = {
  pendente: "#e11d48",
  aceito: "#2563eb",
  em_preparo: "#d97706",
  pronto: "#059669",
  saiu: "#4f46e5",
};

// Carrega o script do Google uma vez só (mesmo com o board remontando).
let carregando: Promise<void> | null = null;
function carregarGoogle(chave: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.maps?.Map) return Promise.resolve();
  if (carregando) return carregando;
  carregando = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(chave)}&v=weekly&language=pt-BR&region=BR`;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { carregando = null; reject(new Error("Não carregou o Google Maps.")); };
    document.head.appendChild(s);
  });
  return carregando;
}

export function MapaPedidosGoogle({ pinos, origem, chave }: {
  pinos: PinoPedido[];
  origem: { lat: number; lng: number } | null;
  chave: string;
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const infoRef = useRef<google.maps.InfoWindow | null>(null);
  const [pronto, setPronto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    carregarGoogle(chave)
      .then(() => {
        if (!vivo || !divRef.current || mapRef.current) return;
        const centro = origem ?? (pinos[0] ? { lat: pinos[0].lat, lng: pinos[0].lng } : { lat: -29.591, lng: -51.16 });
        mapRef.current = new google.maps.Map(divRef.current, {
          center: centro,
          zoom: 14,
          mapTypeControl: true,
          streetViewControl: true,
          fullscreenControl: true,
          clickableIcons: false,
        });
        infoRef.current = new google.maps.InfoWindow();
        setPronto(true);
      })
      .catch((e: Error) => { if (vivo) setErro(e.message); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !pronto) return;
    const marcadores: google.maps.Marker[] = [];
    const info = infoRef.current!;

    if (origem) {
      const m = new google.maps.Marker({
        map,
        position: origem,
        title: "Brasa · ponto de partida",
        label: { text: "🍕", fontSize: "20px" },
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 16, fillColor: "#fff", fillOpacity: 1, strokeColor: "#C78340", strokeWeight: 3 },
        zIndex: 1,
      });
      m.addListener("click", () => { info.setContent("<b>🍕 Brasa</b><br/>Ponto de partida"); info.open({ map, anchor: m }); });
      marcadores.push(m);
    }
    for (const p of pinos) {
      const cor = COR[p.status] ?? "#71717a";
      const m = new google.maps.Marker({
        map,
        position: { lat: p.lat, lng: p.lng },
        title: `#${p.numero ?? "—"} ${p.nome}`,
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 11, fillColor: cor, fillOpacity: 0.95, strokeColor: "#fff", strokeWeight: 2 },
        zIndex: 2,
      });
      m.addListener("click", () => {
        info.setContent(
          `<div style="font:13px system-ui;color:#222"><b>#${p.numero ?? "—"} ${esc(p.nome)}</b><br/>` +
          `${esc(p.bairro ?? "")}<br/>` +
          `Status: ${p.status.replace("_", " ")}${p.entregadorNome ? `<br/>Motoboy: ${esc(p.entregadorNome)}` : ""}<br/>` +
          `<a href="/delivery/${p.id}" style="color:#C78340;font-weight:600">abrir pedido →</a></div>`,
        );
        info.open({ map, anchor: m });
      });
      marcadores.push(m);
    }
    if (pinos.length > 0) {
      const b = new google.maps.LatLngBounds();
      for (const p of pinos) b.extend({ lat: p.lat, lng: p.lng });
      if (origem) b.extend(origem);
      map.fitBounds(b, 60);
    }
    return () => { marcadores.forEach((m) => m.setMap(null)); info.close(); };
  }, [pinos, origem, pronto]);

  return (
    <div>
      <div ref={divRef} className="h-[70vh] w-full overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900" />
      {erro && <p className="mt-2 text-sm text-red-600">{erro} Confira a chave do navegador (GOOGLE_MAPS_BROWSER_KEY) e a restrição de domínio.</p>}
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-zinc-500">
        {Object.entries({ pendente: "Pendente", aceito: "Aceito", em_preparo: "Em preparo", pronto: "Pronto", saiu: "Saiu" }).map(([k, lbl]) => (
          <span key={k} className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-full" style={{ background: COR[k] }} /> {lbl}
          </span>
        ))}
        <span className="ml-auto">Só pedidos de entrega com endereço localizado aparecem no mapa.</span>
      </div>
    </div>
  );
}

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}
