// Gera os gráficos dos apps do TeimoFit (lojas e ícone).
//
// A marca é a do produto: fundo quase preto, o lima de destaque, e o "T" do
// TeimoFit com o ponto do logotipo. Os dois apps precisam ser reconhecíveis
// lado a lado na tela do celular de quem é professor e também treina:
//   Aluno     — fundo escuro, T em lima
//   Professor — fundo lima, T escuro
//
//   public/icons/teimofit-{aluno,professor}-512.png     ícone da loja
//   public/icons/teimofit-{aluno,professor}-192.png     versão pequena
//   public/icons/teimofit-{aluno,professor}-1024.png    iPhone (sem canal alfa)
//   public/icons/teimofit-{aluno,professor}-fg-512.png  frente do ícone adaptativo (Android)
//   public/play/teimofit-{aluno,professor}-capa-1024x500.png      capa da Play
//   public/play/teimofit-{aluno,professor}-cabecalho-3840x1646.png cabeçalho da App Store
// Uso: node scripts/teimofit-graficos.mjs
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const ESCURO = "#0b0d0c";
const LIMA = "#bef264";

// O "T" com o ponto, num quadrado de 100. Hastes grossas e cantos
// arredondados: lido inteiro num ícone de 48px.
const marca = (cor) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <g fill="${cor}">
    <rect x="16" y="18" width="58" height="17" rx="6"/>
    <rect x="36.5" y="18" width="17" height="64" rx="6"/>
    <circle cx="74" cy="73" r="9"/>
  </g>
</svg>`;

async function figura(cor, tamanho) {
  return sharp(Buffer.from(marca(cor))).resize(tamanho, tamanho).png().toBuffer();
}

async function icone(saida, lado, escala, fundo, cor, semAlfa = false) {
  const miolo = Math.round(lado * escala);
  const fig = await figura(cor, miolo);
  const pos = Math.round((lado - miolo) / 2);
  let img = sharp({ create: { width: lado, height: lado, channels: semAlfa ? 3 : 4, background: fundo } })
    .composite([{ input: fig, left: pos, top: pos }]);
  if (semAlfa) img = img.removeAlpha();
  await img.png().toFile(saida);
  console.log("ok", saida);
}

async function capa(saida, W, H, fundo, cor, titulo, frase, escalaTexto) {
  const s = escalaTexto;
  const fig = await figura(cor, Math.round(H * 0.72));
  const texto = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <text x="${72 * s}" y="${236 * s}" font-family="Arial, Helvetica, sans-serif" font-size="${96 * s}" font-weight="700" fill="${cor}" letter-spacing="${-3 * s}">TeimoFit</text>
  <text x="${72 * s}" y="${318 * s}" font-family="Arial, Helvetica, sans-serif" font-size="${56 * s}" font-weight="400" fill="${cor}" letter-spacing="${-1 * s}">${titulo}</text>
  <text x="${74 * s}" y="${392 * s}" font-family="Arial, Helvetica, sans-serif" font-size="${26 * s}" fill="${cor}" opacity="0.75">${frase}</text>
</svg>`);
  await sharp({ create: { width: W, height: H, channels: 3, background: fundo } })
    .composite([
      { input: texto, left: 0, top: 0 },
      { input: fig, left: Math.round(W - H * 0.72 - H * 0.12), top: Math.round(H * 0.14) },
    ])
    .png()
    .toFile(saida);
  console.log("ok", saida);
}

mkdirSync("public/play", { recursive: true });

for (const [app, fundo, cor, titulo, frase] of [
  ["aluno", ESCURO, LIMA, "Aluno", "seus treinos, sua agenda e a sua evolução"],
  ["professor", LIMA, ESCURO, "Professor", "agenda, alunos e treinos na palma da mão"],
]) {
  await icone(`public/icons/teimofit-${app}-512.png`, 512, 0.7, fundo, cor);
  await icone(`public/icons/teimofit-${app}-192.png`, 192, 0.7, fundo, cor);
  await icone(`public/icons/teimofit-${app}-1024.png`, 1024, 0.7, fundo, cor, true);
  // O Android corta ~1/3 da borda do adaptativo: desenho em 54%, fundo transparente.
  await icone(`public/icons/teimofit-${app}-fg-512.png`, 512, 0.54, { r: 0, g: 0, b: 0, alpha: 0 }, cor);
  await capa(`public/play/teimofit-${app}-capa-1024x500.png`, 1024, 500, fundo, cor, titulo, frase, 1);
  await capa(`public/play/teimofit-${app}-cabecalho-3840x1646.png`, 3840, 1646, fundo, cor, titulo, frase, 3.2);
}
