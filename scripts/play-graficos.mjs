// Gera os gráficos da ficha do Motelli Entregador na Play Store a partir do
// desenho do motoboy (public/icons/entregas-512.png, branco sobre marrom):
//   public/icons/motelli-entregador-512.png     ícone da loja (verde, sem transparência)
//   public/icons/motelli-entregador-fg-512.png  camada de frente do ícone adaptativo (fundo transparente, zona segura)
//   public/icons/motelli-entregador-192.png     versão pequena (manifest)
//   public/play/motelli-entregador-capa-1024x500.png  imagem de capa
// Uso: node scripts/play-graficos.mjs
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const VERDE = "#3b6d4f";   // manjericão (marca.ts)
const PAPEL = "#f5f3ec";
const origem = "public/icons/entregas-512.png";

// O desenho vira uma máscara (branco = motoboy) e é pintado da cor pedida.
async function motoboy(cor, tamanho) {
  const mascara = await sharp(origem).resize(tamanho, tamanho).greyscale().threshold(128).toBuffer();
  const [r, g, b] = cor.match(/[0-9a-f]{2}/gi).map((h) => parseInt(h, 16));
  return sharp({ create: { width: tamanho, height: tamanho, channels: 3, background: { r, g, b } } })
    .joinChannel(mascara)
    .png()
    .toBuffer();
}

async function icone(saida, lado, escala, fundo) {
  const miolo = Math.round(lado * escala);
  const fig = await motoboy(PAPEL, miolo);
  const pos = Math.round((lado - miolo) / 2);
  await sharp({ create: { width: lado, height: lado, channels: 4, background: fundo } })
    .composite([{ input: fig, left: pos, top: pos }])
    .png()
    .toFile(saida);
  console.log("ok", saida);
}

mkdirSync("public/play", { recursive: true });
// Ícone da loja: cheio, sem cantos arredondados (a Play arredonda).
await icone("public/icons/motelli-entregador-512.png", 512, 0.78, VERDE);
await icone("public/icons/motelli-entregador-192.png", 192, 0.78, VERDE);
// Camada de frente do adaptativo: o Android corta ~1/3 da borda, então o
// desenho fica em 58% do quadro, sobre transparente; o fundo verde vai em cor.
await icone("public/icons/motelli-entregador-fg-512.png", 512, 0.58, { r: 0, g: 0, b: 0, alpha: 0 });

// Capa 1024×500: verde, o nome em papel, o motoboy à direita.
const fig = await motoboy(PAPEL, 360);
const texto = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500">
  <text x="72" y="236" font-family="Arial, Helvetica, sans-serif" font-size="92" font-weight="700" fill="${PAPEL}" letter-spacing="-2">Motelli</text>
  <text x="72" y="318" font-family="Arial, Helvetica, sans-serif" font-size="56" font-weight="400" fill="${PAPEL}" letter-spacing="-1">Entregador</text>
  <text x="74" y="392" font-family="Arial, Helvetica, sans-serif" font-size="24" fill="${PAPEL}" opacity="0.8">o app de quem entrega</text>
</svg>`);
await sharp({ create: { width: 1024, height: 500, channels: 3, background: VERDE } })
  .composite([{ input: fig, left: 600, top: 70 }, { input: texto, left: 0, top: 0 }])
  .png()
  .toFile("public/play/motelli-entregador-capa-1024x500.png");
console.log("ok public/play/motelli-entregador-capa-1024x500.png");
