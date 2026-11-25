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
    // Só o TeimoFit abre dentro do app, com a ponte nativa (avisos, câmera).
    // Toda academia mora num subdomínio de teimofit.com.br; qualquer outro
    // endereço (WhatsApp, YouTube, site de fora) abre fora, no app do
    // celular. Academia com domínio próprio exigiria incluir aqui e publicar
    // versão nova. A MESMA lista está em www/index.html (DOMINIOS).
    allowNavigation: ["teimofit.com.br", "*.teimofit.com.br"],
    cleartext: false,
    androidScheme: "https",
  },
  android: {
    allowMixedContent: false,
    backgroundColor: "#0B0D0C",
  },
  plugins: {
    // Avisos no celular (Firebase): com o app aberto, o iPhone também mostra.
    FirebaseMessaging: { presentationOptions: ["badge", "sound", "alert"] },
  },
};

export default config;
