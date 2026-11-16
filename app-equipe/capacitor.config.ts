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
    // A tela de entrada ainda confere /api/equipe/identidade antes de abrir.
    // MSG-03 (auditoria): só os NOSSOS domínios abrem dentro do app, com a
    // ponte nativa (GPS, câmera, avisos). Qualquer outro endereço — Google
    // Maps, WhatsApp, site de fora — abre fora, no app do celular. Empresa
    // nova entra por subdomínio de motelli.com.br (decisão do multiempresa);
    // domínio próprio de cliente exige incluir aqui e publicar versão nova.
    // A MESMA lista está em www/index.html (DOMINIOS).
    allowNavigation: ["brasarestaurante.com.br", "*.brasarestaurante.com.br", "motelli.com.br", "*.motelli.com.br"],
    cleartext: false,
    androidScheme: "https",
  },
  android: {
    allowMixedContent: false,
    backgroundColor: "#0e0e10",
  },
  plugins: {
    // Avisos no celular (etapa 2): com o app aberto, o iPhone também mostra.
    FirebaseMessaging: { presentationOptions: ["badge", "sound", "alert"] },
  },
};

export default config;
