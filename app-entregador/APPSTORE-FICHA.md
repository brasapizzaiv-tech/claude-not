# Motelli Entregador — ficha da App Store (pra copiar e colar)

Preparado em 03/10/2026. Conta Apple Developer pessoa física (Rafael, Team
NG2HMYU9Q7); app criado no App Store Connect; build 1.0.0 no TestFlight.
Tudo em **appstoreconnect.apple.com → Apps → Motelli Entregador**.

## 1. Informações do app (menu "Informações do app")

| Campo | Valor |
|---|---|
| Nome | `Motelli Entregador` |
| Subtítulo (30) | `Entregas de restaurante Motelli` |
| Categoria principal | Negócios |
| Categoria secundária | Produtividade (opcional) |
| Direitos de conteúdo | não contém conteúdo de terceiros |
| Classificação etária | responder NÃO a tudo → **4+** (mas o app é de uso profissional) |

**URL da política de privacidade:** `https://motelli.com.br/privacidade`

## 2. Preços e disponibilidade

Gratuito · disponível só no **Brasil**.

## 3. Privacidade do app ("App Privacy")

"Sim, coletamos dados". Tipos:

| Tipo | Vinculado ao usuário? | Usado para rastrear? | Finalidade |
|---|---|---|---|
| Localização → **Localização precisa** | Sim | Não | Funcionalidade do app |
| Localização → Localização aproximada | Sim | Não | Funcionalidade do app |
| Identificadores → **ID do usuário** | Sim | Não | Funcionalidade do app |
| Dados de uso → Interação com o produto | Sim | Não | Funcionalidade do app |

Nada de nome, telefone, e-mail, fotos, contatos, financeiro, saúde.
"Rastreamento" (tracking entre apps/empresas) = **Não**.

## 4. Versão 1.0.0 (menu "1.0 Preparar para envio")

**Capturas de tela do iPhone:** mínimo 3, na tela de **6,9"** (1320×2868) ou
6,5" (1284×2778). As do iPhone do Rafael são redimensionadas por
`node scripts/appstore-capturas.mjs` (pasta "Motelli Entregador - enviar pra Play").
Ordem: Entregas · Localização · Ganhos.

**Texto promocional (170):**
```
O app do entregador dos restaurantes que usam o Motelli: entregas do dia, QR do cupom, ganhos e rastreamento opcional.
```

**Descrição (4000):**
```
O Motelli Entregador é o app do entregador dos restaurantes que usam o sistema Motelli. Ele só funciona com o link pessoal que o restaurante manda pra você: cole o link uma vez e, a partir daí, o app abre direto nas suas entregas.

O QUE VOCÊ FAZ NO APP
• Entregas: vê os pedidos que são seus, lê o QR do cupom pra "pegar" um pedido, marca "saí com essas" e, na porta do cliente, "entreguei" — informando como recebeu (dinheiro, cartão, Pix ou já pago).
• Ganhos: o total do dia e do mês, separado por forma de recebimento e pela taxa de entrega.
• Histórico: as entregas de cada dia, com endereço e horário.
• Localização: com o rastreamento ligado, o restaurante vê onde você está no mapa e calcula o tempo até o cliente.

LOCALIZAÇÃO EM SEGUNDO PLANO
O rastreamento é opcional e você liga e desliga quando quiser, na aba Localização. Enquanto estiver ligado, o app envia a sua posição ao restaurante que cadastrou você — mesmo com a tela apagada ou o app fechado. A posição vai só para esse restaurante e é apagada depois de 90 dias. Nada é enviado com o rastreamento desligado.

PRA QUEM É
Para entregadores (próprios ou autônomos) de restaurantes que usam o Motelli. Não é um app de pedidos para clientes.

SOBRE O MOTELLI
O Motelli é um sistema de gestão para restaurantes — salão, delivery, cozinha, compras, equipe e financeiro — criado dentro de uma pizzaria e usado todos os dias. Mais em motelli.com.br.

Dúvidas sobre o app ou sobre os seus dados: contato@motelli.com.br
```

**Palavras-chave (100, separadas por vírgula):**
```
entregador,entregas,delivery,motoboy,restaurante,pedidos,rastreamento,motelli
```

**URL de suporte:** `https://motelli.com.br` · **URL de marketing:** `https://motelli.com.br`

**Direitos autorais:** `2026 Motelli`

**Versão:** `1.0.0` · **Build:** escolher a mais recente (a do TestFlight).

## 5. Informações de revisão do app (mesma tela, mais abaixo)

**Login necessário:** Sim →
- Nome de usuário: `nao se aplica` · Senha: `nao se aplica`

**Notas (pro revisor):**
```
O app não usa usuário e senha. O acesso é por um link pessoal que o restaurante envia ao entregador.
Como entrar: abra o app, cole o link abaixo em "Cole o link" e toque em "Entrar".
Link de teste: COLE_AQUI_O_LINK_DO_AVALIADOR_GOOGLE
Este entregador de teste não tem entregas atribuídas; as abas Ganhos, Histórico e Localização funcionam normalmente.

LOCALIZAÇÃO EM SEGUNDO PLANO (UIBackgroundModes location): é a função central do app. O entregador liga o rastreamento na aba Localização; o app mostra um aviso próprio explicando a coleta (inclusive com o app fechado) antes de pedir a permissão do iOS; o restaurante acompanha a posição no painel dele durante a entrega. O usuário desliga quando quiser. A posição é enviada só ao restaurante que cadastrou o entregador e apagada após 90 dias (política: https://motelli.com.br/privacidade).
Para testar: aba Localização > "Ligar rastreamento" > aceitar o aviso > "Permitir ao usar o app" / "Permitir sempre".
```

**Contato:** Rafael Locatelli Molder · telefone com +55 · `contato@motelli.com.br`

**Lançamento da versão:** "Lançar automaticamente após a aprovação".

## 6. Enviar

Botão **Adicionar para revisão** → **Enviar para revisão do app**. Revisão
leva de 1 a 3 dias (pode ser mais por causa da localização em segundo plano).
Riscos: diretriz 4.2 (app "só um site") — temos GPS nativo e câmera, e as
notas explicam; e 2.5.4 (localização em segundo plano) — justificada nas notas.

## Depois

- `IPHONEOS_DEPLOYMENT_TARGET` → 15.0 (a Apple exige a partir de abr/2027).
- Trocar os links do painel (Delivery → Entregadores) para a App Store/Play.
