import type { CapacitorConfig } from "@capacitor/cli";

// APP DO ENTREGADOR — UMA CASCA PRA QUALQUER RESTAURANTE
//
// O app não nasce sabendo de que sistema ele é. Ele abre a própria tela
// (`www/index.html`), o entregador cola o link pessoal que a empresa mandou, e
// só então o app passa a carregar o sistema daquela empresa. É isso que permite
// UM app publicado na Play Store servir a Brasa e todo cliente futuro — o
// identificador do app é pra sempre, e um app por cliente seria um beco.
//
// Antes daqui havia um `server.url` fixo no domínio da Brasa. Ficava mais
// simples, mas amarrava o app publicado a um restaurante só.
const config: CapacitorConfig = {
  appId: process.env.APP_ID || "br.com.motelli.entregador",
  appName: process.env.APP_NOME || "Motelli Entregador",
  webDir: "www",
  server: {
    // Sem `url`: o app começa na tela de dentro dele. Depois de o entregador
    // colar o link, é o JavaScript daquela tela que navega pro domínio do
    // cliente — e `allowNavigation` é o que deixa a ponte nativa (GPS, câmera)
    // continuar valendo lá.
    //
    // A tela de entrada ainda confere `/api/entrega/identidade` antes de abrir.
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
    // GPS em segundo plano: serviço nativo com notificação fixa (exigência do Android).
    BackgroundGeolocation: {},
  },
};

export default config;
