// Pinos do mapa de entregas.
//
// No mapa não dá pra usar o componente <Icone>: o Leaflet e o Google Maps
// querem HTML ou imagem crua, não React. Então aqui ficam os mesmos dois
// desenhos (a pizza do restaurante e a bicicleta do entregador) escritos como
// SVG, para o mapa falar a mesma língua do resto do sistema em vez de usar
// emoji, que mudava de cara em cada aparelho.
//
// São os traços da mesma família de ícones do src/components/icone.tsx.

const PIZZA =
  '<path d="m12 14-1 1"/><path d="m13.75 18.25-1.25 1.42"/>' +
  '<path d="M17.775 5.654a15.68 15.68 0 0 0-12.121 12.12"/>' +
  '<path d="M18.8 9.3a1 1 0 0 0 2.1 7.7"/>' +
  '<path d="M21.964 20.732a1 1 0 0 1-1.232 1.232l-18-5a1 1 0 0 1-.695-1.232A19.68 19.68 0 0 1 15.732 2.037a1 1 0 0 1 1.232.695z"/>';

const BIKE =
  '<circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/>' +
  '<circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/>';

function svg(tracos: string, cor: string, tamanho: number) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${tamanho}" height="${tamanho}" viewBox="0 0 24 24" ` +
    `fill="none" stroke="${cor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${tracos}</svg>`
  );
}

/** HTML pronto pro divIcon do Leaflet. */
export function pinoHtml(qual: "restaurante" | "entregador", tamanho = 26) {
  const cor = qual === "restaurante" ? "#c78340" : "#ffffff";
  const sombra = "filter:drop-shadow(0 1px 2px rgba(0,0,0,.55))";
  return `<div style="line-height:0;${sombra}">${svg(qual === "restaurante" ? PIZZA : BIKE, cor, tamanho)}</div>`;
}

/** Endereço de imagem pro marcador do Google Maps. */
export function pinoUrl(qual: "restaurante" | "entregador", tamanho = 22) {
  const cor = qual === "restaurante" ? "#c78340" : "#ffffff";
  const bruto = svg(qual === "restaurante" ? PIZZA : BIKE, cor, tamanho);
  return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(bruto);
}
