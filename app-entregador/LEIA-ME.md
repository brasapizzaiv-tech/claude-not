# Motelli — app do entregador (Android)

Casca nativa (Capacitor), UMA só na loja pra qualquer restaurante: abre a
própria tela de entrada, o entregador cola o link pessoal que a empresa dele
mandou, e daí o app carrega o sistema daquela empresa. A tela é a do site
(atualiza sem reinstalar); o que é nativo:

- **GPS em segundo plano** (serviço com notificação fixa "<empresa> · rastreando"),
  mandando a posição pro sistema mesmo com a tela apagada.
- Câmera (leitor de QR do cupom) e ícone/nome próprios.

Identificador: `br.com.vtmstore.motelli` — é PRA SEMPRE depois de publicado.
Antes de 27/09/2026 chamava "Entregas" (`br.com.vtmstore.entregas`), só por APK;
quem tem esse instalado precisa instalar o Motelli e colar o link de novo.

## Como sai o APK
Não precisa de Android Studio: o GitHub compila.
1. Qualquer mudança em `app-entregador/` no branch `main` dispara o build
   (ou Actions → "App do entregador (Android)" → Run workflow).
2. O APK fica em **Releases → app-entregador → Motelli.apk** — link fixo:
   `https://github.com/brasapizzaiv-tech/claude-not/releases/download/app-entregador/Motelli.apk`
3. No celular do entregador: abre o link, instala (permitir "fontes desconhecidas"),
   abre o app, cola o link pessoal dele, libera localização **"Permitir o tempo todo"**.

## Pra outro restaurante
Não precisa compilar outro app: é o mesmo Motelli. A empresa gera o link pessoal
de cada entregador no painel dela e manda pelo WhatsApp; o app descobre o sistema
pelo link (`/api/entrega/identidade`).

## Play Store (quando for vender)
Precisa de conta Google Play Console (US$ 25, uma vez), um keystore de assinatura
(`gradlew assembleRelease` com o keystore em segredo do GitHub) e a política de
privacidade explicando o uso de localização em segundo plano.
