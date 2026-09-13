// Ajusta o projeto Android gerado pelo `cap add android` (roda no CI depois
// do sync): permissões de localização em segundo plano e câmera, nome do app,
// ícone (o mesmo do site) e cor da barra. Idempotente — pode rodar de novo.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const android = path.join(raiz, "android");
const manifest = path.join(android, "app/src/main/AndroidManifest.xml");
const strings = path.join(android, "app/src/main/res/values/strings.xml");
const nome = process.env.APP_NOME || "Brasa Entregas";

// 1) permissões
let m = fs.readFileSync(manifest, "utf8");
const perms = [
  "android.permission.INTERNET",
  "android.permission.ACCESS_COARSE_LOCATION",
  "android.permission.ACCESS_FINE_LOCATION",
  "android.permission.ACCESS_BACKGROUND_LOCATION",
  "android.permission.FOREGROUND_SERVICE",
  "android.permission.FOREGROUND_SERVICE_LOCATION",
  "android.permission.POST_NOTIFICATIONS",
  "android.permission.CAMERA",
  "android.permission.VIBRATE",
  "android.permission.WAKE_LOCK",
];
for (const p of perms) {
  if (!m.includes(`android:name="${p}"`)) m = m.replace("</manifest>", `    <uses-permission android:name="${p}" />\n</manifest>`);
}
// câmera é opcional (tablet sem câmera ainda instala)
if (!m.includes('android.hardware.camera"')) m = m.replace("</manifest>", `    <uses-feature android:name="android.hardware.camera" android:required="false" />\n</manifest>`);
fs.writeFileSync(manifest, m);
console.log("ok manifest");

// 2) nome
let s = fs.readFileSync(strings, "utf8");
s = s.replace(/<string name="app_name">[^<]*<\/string>/, `<string name="app_name">${nome}</string>`)
     .replace(/<string name="title_activity_main">[^<]*<\/string>/, `<string name="title_activity_main">${nome}</string>`);
fs.writeFileSync(strings, s);
console.log("ok nome:", nome);

// 3) ícone: o PNG do site em todas as densidades (o Android redimensiona)
const icone = path.join(raiz, "..", "public", "icons", "entregas-512.png");
if (fs.existsSync(icone)) {
  const res = path.join(android, "app/src/main/res");
  for (const d of fs.readdirSync(res).filter((x) => x.startsWith("mipmap-"))) {
    for (const f of ["ic_launcher.png", "ic_launcher_round.png", "ic_launcher_foreground.png"]) {
      const alvo = path.join(res, d, f);
      if (fs.existsSync(alvo)) fs.copyFileSync(icone, alvo);
    }
  }
  // ícone adaptativo: fundo marrom da marca
  const anydpi = path.join(res, "mipmap-anydpi-v26");
  if (fs.existsSync(anydpi)) {
    for (const f of ["ic_launcher.xml", "ic_launcher_round.xml"]) {
      const alvo = path.join(anydpi, f);
      if (fs.existsSync(alvo)) fs.writeFileSync(alvo, `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`);
    }
  }
  const valores = path.join(res, "values");
  const bg = path.join(valores, "ic_launcher_background.xml");
  fs.writeFileSync(bg, `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#211915</color>\n</resources>\n`);
  console.log("ok ícone");
} else {
  console.log("ícone não encontrado, mantém o padrão");
}
