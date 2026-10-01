# Motelli Entregador — ficha da Play Store (pra copiar e colar)

Preparado em 01/10/2026, enquanto o Google analisa a identidade da conta
(Play Console → conta "Motelli", organização VTM Store Ltda). Tudo que a
Play pede, na ordem em que ela pede. Os gráficos são gerados por
`node scripts/play-graficos.mjs` (raiz do projeto).

## 1. Criar o app (Play Console → Criar app)

| Campo | Valor |
|---|---|
| Nome do app | `Motelli Entregador` |
| Idioma padrão | Português (Brasil) |
| App ou jogo | App |
| Gratuito ou pago | Gratuito (não dá pra mudar depois) |
| Declarações | marcar as duas (diretrizes e leis de exportação dos EUA) |

## 2. Ficha da loja principal (Crescer → Presença na loja → Ficha da loja)

**Descrição breve** (até 80 caracteres):

```
Entregas, ganhos e localização para quem entrega por um restaurante Motelli.
```

**Descrição completa** (até 4.000 caracteres):

```
O Motelli Entregador é o app do entregador dos restaurantes que usam o sistema Motelli. Ele só funciona com o link pessoal que o restaurante manda pra você: cole o link uma vez e, a partir daí, o app abre direto nas suas entregas.

O QUE VOCÊ FAZ NO APP
• Entregas: vê os pedidos que são seus, lê o QR do cupom pra "pegar" um pedido, marca "saí com essas" e, na porta do cliente, "entreguei" — informando como recebeu (dinheiro, cartão, Pix ou já pago).
• Ganhos: o total do dia e do mês, separado por forma de recebimento e pela taxa de entrega.
• Histórico: as entregas de cada dia, com endereço e horário.
• Localização: com o rastreamento ligado, o restaurante vê onde você está no mapa e calcula o tempo até o cliente.

LOCALIZAÇÃO EM SEGUNDO PLANO
O rastreamento é opcional e você liga e desliga quando quiser, na aba Localização. Enquanto estiver ligado, o app envia a sua posição ao restaurante que cadastrou você — mesmo com a tela apagada ou o app fechado — e o Android mostra uma notificação fixa avisando que ele está ativo. A posição vai só para esse restaurante e é apagada depois de 90 dias. Nada é enviado com o rastreamento desligado.

PRA QUEM É
Para entregadores (próprios ou autônomos) de restaurantes que usam o Motelli. Não é um app de pedidos para clientes: quem quer pedir comida usa o site ou o app de pedidos do restaurante.

SOBRE O MOTELLI
O Motelli é um sistema de gestão para restaurantes — salão, delivery, cozinha, compras, equipe e financeiro — criado dentro de uma pizzaria e usado todos os dias. Mais em motelli.com.br.

Dúvidas sobre o app ou sobre os seus dados: contato@motelli.com.br
```

**Gráficos** (arquivos no projeto, pasta `public/`):

| Item | Arquivo | Exigência |
|---|---|---|
| Ícone do app | `public/icons/motelli-entregador-512.png` | 512×512 PNG, sem transparência |
| Imagem de destaque (capa) | `public/play/motelli-entregador-capa-1024x500.png` | 1024×500 PNG |
| Capturas de tela (celular) | **tirar no celular do Rafael** com o app instalado: aba Entregas (pode ser vazia: "Nenhuma entrega"), aba Localização com o rastreamento ligado, aba Ganhos | mínimo 2, 9:16, entre 320 e 3840 px |

Não precisa de capturas de tablet nem de TV.

**Categorização**

| Campo | Valor |
|---|---|
| Tipo | App |
| Categoria | Negócios |
| Tags | Entregas, Logística, Restaurantes |

**Detalhes de contato** (aparecem na loja)

| Campo | Valor |
|---|---|
| E-mail | `contato@motelli.com.br` |
| Telefone | (opcional, deixar vazio) |
| Site | `https://motelli.com.br` |

## 3. Conteúdo do app (Política → Conteúdo do app) — cada item é um formulário

**Política de privacidade:** `https://motelli.com.br/privacidade`

**Acesso ao app:** "Todas as funcionalidades ou algumas delas são restritas" →
adicionar instruções. O app exige o link pessoal do entregador; criar um
entregador "Avaliador Google" SEM entregas atribuídas (ele vê o app inteiro
sem dados de cliente) e informar:

```
Nome: Avaliador Google
Instruções: Abra o app, cole o link abaixo no campo "Cole o link" e toque em Entrar. Não há senha. O entregador de teste não tem entregas atribuídas; as abas Ganhos, Histórico e Localização funcionam normalmente. Para testar a localização em segundo plano: aba Localização → "Ligar rastreamento" → aceitar o aviso → "Permitir o tempo todo".
Link: (gerar na hora, em Delivery → Entregadores → link do "Avaliador Google")
```

**Anúncios:** Não, o app não tem anúncios.

**Classificação de conteúdo (IARC):** e-mail `contato@motelli.com.br`;
categoria "Utilitário, produtividade, comunicação ou outro"; responder NÃO a
tudo (violência, sexo, drogas, apostas, compras no app, interação entre
usuários, compartilhamento de localização com outros usuários — a posição
vai só para o restaurante, não para outros usuários do app). Resultado
esperado: Livre (L).

**Público-alvo e conteúdo:** faixa etária "18 anos ou mais" apenas. "O app
não foi feito para crianças."

**App de notícias:** Não. **App de rastreamento de contatos COVID-19:** Não.

**Segurança de dados** (o formulário grande):

- O app coleta ou compartilha dados do usuário? **Sim.**
- Todos os dados são criptografados em trânsito? **Sim** (HTTPS).
- Oferece um jeito de pedir a exclusão dos dados? **Sim** — URL
  `https://motelli.com.br/privacidade` (seção sobre pedir os dados / e-mail).

Tipos de dados a marcar:

| Categoria | Tipo | Coletado | Compartilhado | Opcional? | Finalidade |
|---|---|---|---|---|---|
| Localização | Localização precisa | Sim | Sim (com o restaurante que cadastrou o entregador) | Sim (o usuário liga/desliga) | Funcionalidade do app |
| Localização | Localização aproximada | Sim | Sim | Sim | Funcionalidade do app |
| IDs do usuário | IDs do usuário (o link pessoal identifica o entregador) | Sim | Não | Não (obrigatório pra entrar) | Funcionalidade do app, gerenciamento da conta |
| Atividade no app | Outras ações no app (pegar/sair/entreguei) | Sim | Sim (restaurante) | Não | Funcionalidade do app |

NÃO marcar: nome, e-mail, telefone (o restaurante cadastra no sistema dele;
o app não pede nem envia), fotos (a câmera só lê o QR, nada é gravado),
contatos, informações financeiras, dados de saúde, mensagens, arquivos,
identificadores do aparelho.

Para cada tipo: "Os dados são processados de forma temporária?" → **Não**
(a posição fica 90 dias; as ações ficam no histórico do restaurante).

**Permissões de serviço em primeiro plano** (targetSdk 35 exige): tipo
**Localização** →

```
O app mantém um serviço em primeiro plano, com notificação fixa, enquanto o entregador deixa o rastreamento ligado durante o turno de entregas. É ele que envia a posição ao restaurante com a tela apagada ou o app fechado. O usuário liga e desliga na aba Localização.
```
(+ o mesmo vídeo da localização em segundo plano)

**Permissões sensíveis → Localização em segundo plano** (formulário de
declaração):

- Recurso principal que usa a localização em segundo plano:

```
Rastreamento do entregador durante o turno. Com o rastreamento ligado, o restaurante que cadastrou o entregador vê a posição dele no mapa do painel de delivery e estima o tempo até o cliente. A posição é enviada a cada 15 segundos.
```

- Por que precisa ser em segundo plano:

```
Durante a entrega o celular fica no bolso ou no suporte da moto, com a tela apagada ou em outro app (mapa, telefone). Sem a permissão "o tempo todo", a posição para de atualizar assim que o app sai da tela, e o restaurante perde o entregador no mapa justamente quando ele está na rua. O rastreamento é opcional, ligado pelo próprio entregador, com aviso prévio dentro do app e notificação fixa do Android enquanto estiver ativo.
```

- Vídeo (link do YouTube, "não listado"), de 30 a 60 segundos, mostrando
  NESSA ORDEM: (1) abrir o app e ir na aba Localização; (2) tocar "Ligar
  rastreamento" e aparecer o aviso do app ("Sua localização… mesmo quando o
  app está fechado"); (3) tocar "Aceitar e ligar" e o Android pedir a
  permissão → escolher "Permitir o tempo todo"; (4) a notificação fixa na
  barra; (5) apertar o botão home (app em segundo plano) e, no painel do
  restaurante no computador, a bolinha do entregador se movendo no mapa.
  Gravar com a gravação de tela do próprio Android.

## 4. Versão (Lançar → Produção → Criar nova versão)

- Assinatura: deixar "Google Play App Signing" ligado (padrão). A chave de
  UPLOAD é a de `Motelli - chave do app (NAO APAGAR)` (OneDrive do Rafael);
  o GitHub assina sozinho quando os 4 segredos existirem no repositório.
- Pacote: baixar `MotelliEntregador.aab` no GitHub → Actions → execução mais
  recente → artefato "MotelliEntregador-aab".
- Notas da versão (pt-BR):

```
Primeira versão do Motelli Entregador: entregas do dia, leitura do QR do cupom, ganhos, histórico e rastreamento opcional em segundo plano.
```

- Países: Brasil.
- Antes da produção, vale um lançamento em **teste interno** (lista com o
  e-mail do Rafael) pra confirmar que instala e abre; conta de organização não
  exige os 12 testadores por 14 dias.

## 5. Depois de publicado

- O APK de teste do GitHub continua existindo pra quem quiser, mas o caminho
  oficial passa a ser a Play. Quem tem o "Entregas" antigo instala o novo e
  cola o link de novo.
- Trocar `CONTATO_EMAIL` (src/app/motelli/marca.ts) pra contato@motelli.com.br.
