// Ajusta o projeto iOS gerado pelo `cap add ios` (roda no CI, num Mac, depois
// do sync): textos de permissão, localização em segundo plano, versão,
// identificador, assinatura manual (perfil da App Store) e ícone.
// Idempotente — pode rodar de novo.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ios = path.join(raiz, "ios", "App");
const plist = path.join(ios, "App", "Info.plist");
const pbx = path.join(ios, "App.xcodeproj", "project.pbxproj");

const appId = process.env.APP_ID || "br.com.motelli.entregador";
const nome = process.env.APP_NOME || "Motelli Entregador";
const versionName = process.env.APP_VERSION_NAME || "1.0.0";
const versionCode = process.env.APP_VERSION_CODE || "1";
const teamId = process.env.APPLE_TEAM_ID || "";
const perfil = process.env.IOS_PROFILE_NAME || "Motelli Entregador App Store";

// ---------------------------------------------------------------------------
// 1) Info.plist — o que a App Store exige declarar em texto, na língua do
// usuário. Os textos de localização têm que combinar com o aviso que o app
// mostra (entrega-client.tsx) e com a política de privacidade.
// ---------------------------------------------------------------------------
const chaves = {
  CFBundleDisplayName: nome,
  NSLocationWhenInUseUsageDescription:
    "Para o restaurante ver onde você está durante as entregas e calcular o tempo até o cliente.",
  NSLocationAlwaysAndWhenInUseUsageDescription:
    "Com o rastreamento ligado, o restaurante acompanha a sua posição mesmo com a tela apagada ou o app fechado. Você liga e desliga quando quiser, na aba Localização.",
  NSLocationAlwaysUsageDescription:
    "Com o rastreamento ligado, o restaurante acompanha a sua posição mesmo com a tela apagada ou o app fechado.",
  NSCameraUsageDescription: "Só para ler o QR code do cupom da entrega. Nenhuma foto é gravada.",
};
let p = fs.readFileSync(plist, "utf8");
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
for (const [k, v] of Object.entries(chaves)) {
  const re = new RegExp(`<key>${k}</key>\\s*<string>[^<]*</string>`);
  const linha = `<key>${k}</key>\n\t<string>${esc(v)}</string>`;
  p = re.test(p) ? p.replace(re, linha) : p.replace("</dict>\n</plist>", `\t${linha}\n</dict>\n</plist>`);
}
// Localização em segundo plano (serviço do plugin) e "sem criptografia
// própria" (evita a pergunta de exportação a cada envio).
if (!p.includes("<key>UIBackgroundModes</key>")) {
  p = p.replace("</dict>\n</plist>", "\t<key>UIBackgroundModes</key>\n\t<array>\n\t\t<string>location</string>\n\t</array>\n</dict>\n</plist>");
}
if (!p.includes("<key>ITSAppUsesNonExemptEncryption</key>")) {
  p = p.replace("</dict>\n</plist>", "\t<key>ITSAppUsesNonExemptEncryption</key>\n\t<false/>\n</dict>\n</plist>");
}
// Só retrato no iPhone (o app é de celular na mão, e orientação livre exige
// capturas de tela a mais na loja).
p = p.replace(
  /<key>UISupportedInterfaceOrientations<\/key>\s*<array>[\s\S]*?<\/array>/,
  "<key>UISupportedInterfaceOrientations</key>\n\t<array>\n\t\t<string>UIInterfaceOrientationPortrait</string>\n\t</array>",
);
fs.writeFileSync(plist, p);
console.log("ok Info.plist");

// ---------------------------------------------------------------------------
// 2) project.pbxproj — identificador, versão, só iPhone, e assinatura MANUAL
// com o perfil da App Store (os Pods ficam de fora: só o alvo App tem
// PROVISIONING_PROFILE_SPECIFIER, que é o que o `cap add` gera).
// ---------------------------------------------------------------------------
let g = fs.readFileSync(pbx, "utf8");
g = g.replace(/PRODUCT_BUNDLE_IDENTIFIER = [^;]+;/g, `PRODUCT_BUNDLE_IDENTIFIER = ${appId};`)
     .replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${versionName};`)
     .replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${versionCode};`)
     .replace(/TARGETED_DEVICE_FAMILY = "1,2";/g, `TARGETED_DEVICE_FAMILY = 1;`);
if (teamId) {
  // Cada bloco de buildSettings do alvo App tem CODE_SIGN_STYLE; trocamos por
  // manual + time + perfil + identidade. Só onde já existe CODE_SIGN_STYLE
  // (alvo App), nunca nos Pods.
  g = g.replace(/CODE_SIGN_STYLE = Automatic;/g, () =>
    [
      `CODE_SIGN_STYLE = Manual;`,
      `\t\t\t\tDEVELOPMENT_TEAM = ${teamId};`,
      `\t\t\t\tPROVISIONING_PROFILE_SPECIFIER = "${perfil}";`,
      `\t\t\t\t"CODE_SIGN_IDENTITY[sdk=iphoneos*]" = "Apple Distribution";`,
    ].join("\n"),
  );
}
fs.writeFileSync(pbx, g);
console.log("ok projeto:", appId, versionName, `(${versionCode})`, teamId ? "assinatura manual" : "sem time (assinatura automática)");

// ---------------------------------------------------------------------------
// 3) Ícone: o PNG 1024×1024 sem transparência (gerado por scripts/play-graficos.mjs).
// ---------------------------------------------------------------------------
const icone = path.join(raiz, "..", "public", "icons", "motelli-entregador-1024.png");
const conjunto = path.join(ios, "App", "Assets.xcassets", "AppIcon.appiconset");
if (fs.existsSync(icone) && fs.existsSync(conjunto)) {
  for (const f of fs.readdirSync(conjunto)) if (f.endsWith(".png")) fs.rmSync(path.join(conjunto, f));
  fs.copyFileSync(icone, path.join(conjunto, "AppIcon-1024.png"));
  fs.writeFileSync(path.join(conjunto, "Contents.json"), JSON.stringify({
    images: [{ filename: "AppIcon-1024.png", idiom: "universal", platform: "ios", size: "1024x1024" }],
    info: { author: "xcode", version: 1 },
  }, null, 2) + "\n");
  console.log("ok ícone");
} else {
  console.log("ícone não encontrado, mantém o padrão");
}
