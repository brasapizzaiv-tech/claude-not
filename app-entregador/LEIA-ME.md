# App do entregador (Android) — Brasa Entregas

Casca nativa (Capacitor) que abre `https://www.brasarestaurante.com.br/entrega`
dentro do app. A tela é a do site (atualiza sem reinstalar); o que é nativo:

- **GPS em segundo plano** (serviço com notificação fixa "Brasa Entregas · rastreando"),
  mandando a posição pro sistema mesmo com a tela apagada.
- Câmera (leitor de QR do cupom) e ícone/nome próprios.

## Como sai o APK
Não precisa de Android Studio: o GitHub compila.
1. Qualquer mudança em `app-entregador/` no branch `main` dispara o build
   (ou Actions → "App do entregador (Android)" → Run workflow).
2. O APK fica em **Releases → app-entregador → BrasaEntregas.apk** — link fixo:
   `https://github.com/brasapizzaiv-tech/claude-not/releases/download/app-entregador/BrasaEntregas.apk`
3. No celular do entregador: abre o link, instala (permitir "fontes desconhecidas"),
   abre o app, cola o link pessoal dele, libera localização **"Permitir o tempo todo"**.

## Pra outro restaurante (white-label)
Compilar com variáveis: `APP_URL` (ex.: `https://sistema.dorestaurante.com.br/entrega`),
`APP_NOME`, `APP_ID` (ex.: `br.com.dorestaurante.entregas`) e trocar `public/icons/entregas-512.png`.

## Play Store (quando for vender)
Precisa de conta Google Play Console (US$ 25, uma vez), um keystore de assinatura
(`gradlew assembleRelease` com o keystore em segredo do GitHub) e a política de
privacidade explicando o uso de localização em segundo plano.
