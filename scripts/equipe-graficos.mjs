// Gera os gráficos do app Motelli Equipe (lojas e ícone), irmão do
// scripts/play-graficos.mjs do Entregador. Mesma família visual: desenho em
// papel sobre uma cor cheia; aqui um grupo de pessoas sobre azul-petróleo
// (o verde manjericão é do Entregador).
//   public/icons/motelli-equipe-512.png     ícone da loja
//   public/icons/motelli-equipe-192.png     versão pequena
//   public/icons/motelli-equipe-1024.png    iPhone (sem canal alfa)
//   public/icons/motelli-equipe-fg-512.png  frente do ícone adaptativo (Android)
//   public/play/motelli-equipe-capa-1024x500.png  capa da Play
// Uso: node scripts/equipe-graficos.mjs
import sharp from "sharp";
import { mkdirSync } from "node:fs";

export const AZUL = "#2f5d7c";
const PAPEL = "#f5f3ec";

// Três pessoas: a da frente maior, duas atrás (contorno na cor do fundo
// separa a da frente das de trás).
const grupo = (cor) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <g fill="${cor}">
    <circle cx="24" cy="40" r="9"/>
    <path d="M6 76 q0 -20 18 -20 q8 0 13 4 q-8 7 -9 16 z"/>
    <circle cx="76" cy="40" r="9"/>
    <path d="M94 76 q0 -20 -18 -20 q-8 0 -13 4 q8 7 9 16 z"/>
    <g stroke="${AZUL}" stroke-width="3.5" stroke-linejoin="round">
      <circle cx="50" cy="34" r="13"/>
      <path d="M26 76 q0 -24 24 -24 q24 0 24 24 z"/>
    </g>
  </g>
</svg>`;

async function figura(tamanho) {
  return sharp(Buffer.from(grupo(PAPEL))).resize(tamanho, tamanho).png().toBuffer();
}

async function icone(saida, lado, escala, fundo, semAlfa = false) {
  const miolo = Math.round(lado * escala);
  const fig = await figura(miolo);
  const pos = Math.round((lado - miolo) / 2);
  let img = sharp({ create: { width: lado, height: lado, channels: semAlfa ? 3 : 4, background: fundo } })
    .composite([{ input: fig, left: pos, top: pos }]);
  if (semAlfa) img = img.removeAlpha();
  await img.png().toFile(saida);
  console.log("ok", saida);
}

mkdirSync("public/play", { recursive: true });
await icone("public/icons/motelli-equipe-512.png", 512, 0.74, AZUL);
await icone("public/icons/motelli-equipe-192.png", 192, 0.74, AZUL);
await icone("public/icons/motelli-equipe-1024.png", 1024, 0.74, AZUL, true);
// O Android corta ~1/3 da borda do adaptativo: desenho em 56%, fundo transparente.
await icone("public/icons/motelli-equipe-fg-512.png", 512, 0.56, { r: 0, g: 0, b: 0, alpha: 0 });

// Capa 1024×500: azul, o nome em papel, o grupo à direita.
const fig = await figura(360);
const texto = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500">
  <text x="72" y="236" font-family="Arial, Helvetica, sans-serif" font-size="92" font-weight="700" fill="${PAPEL}" letter-spacing="-2">Motelli</text>
  <text x="72" y="318" font-family="Arial, Helvetica, sans-serif" font-size="56" font-weight="400" fill="${PAPEL}" letter-spacing="-1">Equipe</text>
  <text x="74" y="392" font-family="Arial, Helvetica, sans-serif" font-size="24" fill="${PAPEL}" opacity="0.8">o app de quem trabalha no restaurante</text>
</svg>`);
await sharp({ create: { width: 1024, height: 500, channels: 3, background: AZUL } })
  .composite([{ input: texto, left: 0, top: 0 }, { input: fig, left: 600, top: 70 }])
  .png()
  .toFile("public/play/motelli-equipe-capa-1024x500.png");
console.log("ok public/play/motelli-equipe-capa-1024x500.png");

// Cabeçalho da página do app na App Store ("ativo de cabeçalho"), 3840×1646:
// a mesma capa, em grande, com o texto à esquerda e o grupo à direita.
{
  const W = 3840, H = 1646;
  const grande = await figura(1150);
  const txt = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <text x="300" y="760" font-family="Arial, Helvetica, sans-serif" font-size="300" font-weight="700" fill="${PAPEL}" letter-spacing="-6">Motelli</text>
  <text x="300" y="1020" font-family="Arial, Helvetica, sans-serif" font-size="180" font-weight="400" fill="${PAPEL}" letter-spacing="-3">Equipe</text>
  <text x="306" y="1220" font-family="Arial, Helvetica, sans-serif" font-size="76" fill="${PAPEL}" opacity="0.8">o app de quem trabalha no restaurante</text>
</svg>`);
  await sharp({ create: { width: W, height: H, channels: 3, background: AZUL } })
    .composite([{ input: txt, left: 0, top: 0 }, { input: grande, left: 2350, top: 250 }])
    .png()
    .toFile("public/play/motelli-equipe-cabecalho-3840x1646.png");
  console.log("ok public/play/motelli-equipe-cabecalho-3840x1646.png");
}

// Ícone pequeno da notificação no Android: só a silhueta, branca sobre
// transparente (o Android pinta da cor do app; ícone colorido vira um quadrado).
{
  const branco = Buffer.from(grupo("#ffffff").replace(/stroke="[^"]*"/, 'stroke="#000000" stroke-opacity="0"'));
  await sharp(branco).resize(96, 96).png().toFile("public/icons/motelli-equipe-notificacao-96.png");
  console.log("ok public/icons/motelli-equipe-notificacao-96.png");
}
