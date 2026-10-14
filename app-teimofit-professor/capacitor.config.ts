import type { CapacitorConfig } from "@capacitor/cli";

// APP DO PROFESSOR DO TEIMOFIT
//
// O painel de qualquer academia mora no mesmo endereço (teimofit.com.br): a
// academia vem do login, não do endereço. Então este app abre direto ali —
// a tela própria (`www/index.html`) só existe para quando não há internet.
const config: CapacitorConfig = {
  appId: process.env.APP_ID || "br.com.teimofit.professor",
  appName: process.env.APP_NOME || "TeimoFit Professor",
  webDir: "www",
  server: {
    // Só o TeimoFit abre dentro do app. O resto (o WhatsApp do "Mandar
    // link", um vídeo do YouTube) abre fora, no app de cada coisa.
    allowNavigation: ["teimofit.com.br", "*.teimofit.com.br"],
    cleartext: false,
    androidScheme: "https",
  },
  android: {
    allowMixedContent: false,
    backgroundColor: "#0B0D0C",
  },
};

export default config;
