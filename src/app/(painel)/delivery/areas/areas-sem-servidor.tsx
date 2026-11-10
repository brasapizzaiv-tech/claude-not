"use client";

// O mapa (Leaflet) mexe em `window` assim que é importado: montado no servidor
// ele quebrava e o React refazia a tela inteira no navegador (erro #419,
// TEL-004). Aqui a tela das áreas só é montada no navegador.
import dynamic from "next/dynamic";

export const AreasClient = dynamic(() => import("./areas-client").then((m) => m.AreasClient), {
  ssr: false,
  loading: () => <div className="cartao p-6 text-sm text-texto-suave">Carregando o mapa…</div>,
});
