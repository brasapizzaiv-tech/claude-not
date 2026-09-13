import type { CapacitorConfig } from "@capacitor/cli";

// App do entregador: uma casca nativa que carrega o /entrega do SISTEMA
// (server.url). Assim a tela é sempre a do site — atualiza sem reinstalar —
// e a ponte nativa (Capacitor) fica disponível lá dentro pra GPS em segundo
// plano e câmera. Pra outro restaurante: trocar APP_URL/APP_NOME no build.
const APP_URL = process.env.APP_URL || "https://www.brasarestaurante.com.br/entrega";

const config: CapacitorConfig = {
  appId: process.env.APP_ID || "br.com.brasarestaurante.entregas",
  appName: process.env.APP_NOME || "Brasa Entregas",
  webDir: "www",
  server: {
    url: APP_URL,
    cleartext: false,
    // o app pode navegar por todo o domínio do sistema (acompanhamento, mapa…)
    allowNavigation: [new URL(APP_URL).host],
  },
  android: {
    allowMixedContent: false,
    backgroundColor: "#09090b",
  },
  plugins: {
    // GPS em segundo plano: serviço nativo com notificação fixa (exigência do Android).
    BackgroundGeolocation: {},
  },
};

export default config;
