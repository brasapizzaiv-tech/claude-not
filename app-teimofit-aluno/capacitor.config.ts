import type { CapacitorConfig } from "@capacitor/cli";

// APP DO ALUNO DO TEIMOFIT — UMA CASCA PARA QUALQUER ACADEMIA
//
// O app não nasce sabendo de que academia ele é. Ele abre a própria tela
// (`www/index.html`), o aluno entra com celular + PIN (quem já entrou uma
// vez) ou com o código / QR / link que a professora mandou (a primeira vez),
// e o app passa a carregar o endereço da academia dele. Um app só na loja
// serve todas as academias do TeimoFit.
const config: CapacitorConfig = {
  appId: process.env.APP_ID || "br.com.teimofit.aluno",
  appName: process.env.APP_NOME || "TeimoFit",
  webDir: "www",
  server: {
    // As academias podem ter domínio próprio, que não existe na hora do
    // build: a lista é aberta, e quem fecha a porta é a tela de entrada — só
    // navega depois que o endereço responde /api/aluno/identidade dizendo
    // que ali roda o TeimoFit.
    allowNavigation: ["*"],
    cleartext: false,
    androidScheme: "https",
  },
  android: {
    allowMixedContent: false,
    backgroundColor: "#0B0D0C",
  },
};

export default config;
