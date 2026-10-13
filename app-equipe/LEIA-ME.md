# Motelli Equipe (app nativo da equipe)

Casca Capacitor igual à do Motelli Entregador (`app-entregador/`): a tela de
entrada (`www/index.html`) pede o **código de 6 números** do colaborador (painel →
Equipe → Colaboradores), lê o **QR** de lá ou aceita o **link**; o código vira o
link pessoal em `motelli.com.br/api/equipe/ativar` (migration 0232) e o app
passa a abrir o `/eu/{token}` da empresa. Depois é o PIN, como no link.

- Identificador: `br.com.motelli.equipe` (pra sempre depois de publicado).
- Builds: `.github/workflows/app-equipe.yml` (APK de teste no release
  `app-equipe` + .aab assinado com a mesma chave de upload do Entregador) e
  `app-equipe-ios.yml` (precisa do perfil "Motelli Equipe App Store" no segredo
  `IOS_PROFILE_EQUIPE_BASE64`).
- Ícones: `node scripts/equipe-graficos.mjs` (azul-petróleo #2f5d7c).
- Notificações (Firebase) entram na etapa 2.
