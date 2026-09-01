"use client";

// Mapa dos pedidos ativos (Leaflet + OpenStreetMap — grátis, sem chave).
// Pinos coloridos por status; clique abre o pedido.
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type PinoPedido = {
  id: string;
  numero: number | null;
  nome: string;
  status: string;
  lat: number;
  lng: number;
  entregadorNome: string | null;
  bairro: string | null;
};

const COR: Record<string, string> = {
  pendente: "#e11d48",
  aceito: "#2563eb",
  em_preparo: "#d97706",
  pronto: "#059669",
  saiu: "#4f46e5",
};

export function MapaPedidos({ pinos, origem }: {
  pinos: PinoPedido[];
  origem: { lat: number; lng: number } | null;
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!divRef.current || mapRef.current) return;
    const centro: [number, number] = origem ? [origem.lat, origem.lng] : pinos[0] ? [pinos[0].lat, pinos[0].lng] : [-29.591, -51.16];
    const map = L.map(divRef.current).setView(centro, 14);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const camada = L.layerGroup().addTo(map);

    if (origem) {
      L.marker([origem.lat, origem.lng], {
        icon: L.divIcon({ html: "🍕", className: "", iconSize: [28, 28], iconAnchor: [14, 14] }),
        title: "Restaurante",
      }).addTo(camada).bindPopup("<b>🍕 Brasa</b><br/>Ponto de partida");
    }
    for (const p of pinos) {
      const cor = COR[p.status] ?? "#71717a";
      L.circleMarker([p.lat, p.lng], { radius: 10, color: "#fff", weight: 2, fillColor: cor, fillOpacity: 0.95 })
        .addTo(camada)
        .bindPopup(
          `<b>#${p.numero ?? "—"} ${p.nome}</b><br/>` +
          `${p.bairro ?? ""}<br/>` +
          `Status: ${p.status.replace("_", " ")}${p.entregadorNome ? `<br/>Motoboy: ${p.entregadorNome}` : ""}<br/>` +
          `<a href="/delivery/${p.id}">abrir pedido →</a>`,
        );
    }
    if (pinos.length > 0) {
      const b = L.latLngBounds(pinos.map((p) => [p.lat, p.lng] as [number, number]));
      if (origem) b.extend([origem.lat, origem.lng]);
      map.fitBounds(b.pad(0.2));
    }
    return () => { camada.remove(); };
  }, [pinos, origem]);

  return (
    <div>
      <div ref={divRef} className="h-[70vh] w-full overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800" />
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
