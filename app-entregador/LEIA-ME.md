# Motelli Entregador (Android)

Motelli é a marca do sistema inteiro; cada app leva "Motelli" + o que faz.
A empresa por trás (VTM Store) é só o CNPJ e não aparece em nada público.

Casca nativa (Capacitor), UMA só na loja pra qualquer restaurante: abre a
própria tela de entrada, o entregador cola o link pessoal que a empresa dele
mandou, e daí o app carrega o sistema daquela empresa. A tela é a do site
(atualiza sem reinstalar); o que é nativo:

- **GPS em segundo plano** (serviço com notificação fixa "<empresa> · rastreando"),
  mandando a posição pro sistema mesmo com a tela apagada.
- Câmera (leitor de QR do cupom) e ícone/nome próprios.

Identificador: `br.com.motelli.entregador` (do domínio motelli.com.br, registrado
em 27/09/2026) — é PRA SEMPRE depois de publicado. Antes chamava "Entregas"
(`br.com.vtmstore.entregas`), só por APK; quem tem esse instalado precisa
instalar o Motelli Entregador e colar o link de novo.

## Como sai o APK
Não precisa de Android Studio: o GitHub compila.
1. Qualquer mudança em `app-entregador/` no branch `main` dispara o build
   (ou Actions → "App do entregador (Android)" → Run workflow).
2. O APK fica em **Releases → app-entregador → MotelliEntregador.apk** — link fixo:
   `https://github.com/brasapizzaiv-tech/claude-not/releases/download/app-entregador/MotelliEntregador.apk`
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
