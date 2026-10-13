import type { CapacitorConfig } from "@capacitor/cli";

// APP DA EQUIPE — UMA CASCA PRA QUALQUER RESTAURANTE (irmão do Motelli Entregador)
//
// O app não nasce sabendo de que sistema ele é. Ele abre a própria tela
// (`www/index.html`), a pessoa digita o código de entrada (ou lê o QR do
// painel, ou cola o link), e o app passa a carregar o /eu/{token} da empresa
// dela. Um app só na loja serve a Brasa e todo cliente futuro.
const config: CapacitorConfig = {
  appId: process.env.APP_ID || "br.com.motelli.equipe",
  appName: process.env.APP_NOME || "Motelli Equipe",
  webDir: "www",
  server: {
    // Os domínios dos clientes não existem na hora do build: a lista é aberta,
    // e quem fecha a porta é a tela de entrada — só navega depois que o
    // endereço responde /api/equipe/identidade dizendo que é um sistema nosso.
    allowNavigation: ["*"],
    cleartext: false,
    androidScheme: "https",
  },
  android: {
    allowMixedContent: false,
    backgroundColor: "#0e0e10",
  },
};

export default config;
