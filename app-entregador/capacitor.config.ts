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
  appId: process.env.APP_ID || "br.com.vtmstore.entregas",
  appName: process.env.APP_NOME || "Entregas",
  webDir: "www",
  server: {
    // Sem `url`: o app começa na tela de dentro dele. Depois de o entregador
    // colar o link, é o JavaScript daquela tela que navega pro domínio do
    // cliente — e `allowNavigation` é o que deixa a ponte nativa (GPS, câmera)
    // continuar valendo lá.
    //
    // A lista é aberta porque os domínios dos clientes não existem na hora do
    // build. Quem fecha a porta é a tela de entrada: ela só aceita https e só
    // navega depois que o endereço responde `/api/entrega/identidade` dizendo
    // que ali roda um sistema nosso.
    allowNavigation: ["*"],
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
