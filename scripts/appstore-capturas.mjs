// Capturas de tela do iPhone no tamanho que a App Store exige.
// Entrada: PNGs do iPhone do Rafael (ex.: 1206×2622, iPhone 6,3") na pasta
// "Motelli Entregador - enviar pra Play". Saída: duas pastas, "App Store 6.9"
// (1320×2868) e "App Store 6.5" (1284×2778), na mesma ordem.
// Uso: node scripts/appstore-capturas.mjs IMG_4318.PNG IMG_4319.PNG ...
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import path from "node:path";

const PASTA = "C:/Users/NeoTech/OneDrive/Desktop/Motelli Entregador - enviar pra Play";
const TAMANHOS = { "App Store 6.9": [1320, 2868], "App Store 6.5": [1284, 2778] };
const arquivos = process.argv.slice(2);
if (!arquivos.length) { console.error("passe os arquivos na ordem da loja"); process.exit(1); }

for (const [pasta, [w, h]] of Object.entries(TAMANHOS)) {
  const dir = path.join(PASTA, pasta);
  mkdirSync(dir, { recursive: true });
  let n = 1;
  for (const a of arquivos) {
    const saida = path.join(dir, `${n++} - ${path.parse(a).name}.png`);
    // A proporção do iPhone 6,3" (2,174) é quase a dos tamanhos pedidos (2,163
    // e 2,173): "cover" redimensiona e apara no máximo meio por cento.
    await sharp(path.join(PASTA, a)).resize(w, h, { fit: "cover", position: "centre" }).png().toFile(saida);
    console.log("ok", saida);
  }
}
