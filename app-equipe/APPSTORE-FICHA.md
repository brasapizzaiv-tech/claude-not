# Motelli Equipe — ficha da App Store (pra copiar e colar)

Mesmo caminho do Motelli Entregador (ver `app-entregador/APPSTORE-FICHA.md`).
Build 1.0.0 enviado pelo workflow `app-equipe-ios.yml` em 13/10/2026.
Tudo em **appstoreconnect.apple.com → Apps → Motelli Equipe**.

## 1. Informações do app (menu "Informações do app")

| Campo | Valor |
|---|---|
| Subtítulo (30) | `Equipe de restaurante Motelli` |
| Categoria principal | Negócios |
| Categoria secundária | Produtividade (opcional) |
| Direitos de conteúdo | não contém conteúdo de terceiros |
| Classificação etária | NÃO em tudo → 4+ |

**URL da política de privacidade:** `https://motelli.com.br/privacidade`

## 2. Preços e disponibilidade

Gratuito · disponível só no **Brasil**.

## 3. Privacidade do app ("App Privacy")

"Sim, coletamos dados". Tipos (todos: vinculado ao usuário = Sim · rastreamento = Não · finalidade = Funcionalidade do app):

- Informações de contato → **Nome**
- Identificadores → **ID do usuário**
- Informações financeiras → **Outras informações financeiras** (pagamentos da semana, compras internas)
- Dados de uso → **Interação com o produto** (folgas, contagens, conferências, lembretes)

Nada de localização, fotos, contatos, e-mail, telefone, saúde. Rastreamento = **Não**.

## 4. Versão 1.0 ("1.0 Preparar para envio")

**Capturas de tela (iPhone 6,5" — 1284×2778), mínimo 3:** tirar no iPhone
abrindo o app da equipe (ou o link /eu no Safari) — tela do código, tela inicial
da equipe e uma de dentro (Minhas folgas ou Lembretes). Redimensionar com
`PASTA="...Motelli Equipe - enviar pra Play" node scripts/appstore-capturas.mjs IMG_1.PNG IMG_2.PNG IMG_3.PNG`.

**Texto promocional (170):**
```
O app de quem trabalha num restaurante que usa o Motelli: folgas, lembretes, contagem de estoque, conferência de pedidos e pagamentos.
```

**Descrição:**
```
O Motelli Equipe é o app dos funcionários dos restaurantes que usam o sistema Motelli. Para entrar, digite o código de 6 números que a gerência te passa (ou leia o QR code no painel do restaurante) e crie o seu PIN. Depois, o app abre direto na sua área.

O QUE VOCÊ FAZ NO APP
• Folgas: pede folga e acompanha se foi aprovada.
• Lembretes: vê os avisos da gerência pro dia e marca "visto" ou "feito".
• Contagem de estoque: preenche a contagem pelo celular, lê o QR das etiquetas e diz onde está cada item.
• Conferência de pedidos: confere o que chegou do fornecedor ou avisa que não veio.
• Checklists da rotina do seu setor.
• Seus pagamentos da semana e as compras que você fez no restaurante.
• Pedidos de compra ou de manutenção pra gerência.

O que aparece pra você depende do que o restaurante liberou no seu cadastro.

PRA QUEM É
Para funcionários de restaurantes que usam o Motelli. Não é um app de pedidos para clientes.

SOBRE O MOTELLI
O Motelli é um sistema de gestão para restaurantes — salão, delivery, cozinha, compras, equipe e financeiro — criado dentro de uma pizzaria e usado todos os dias. Mais em motelli.com.br.

Dúvidas sobre o app ou sobre os seus dados: contato@motelli.com.br
```

**Palavras-chave (100):**
```
equipe,funcionarios,restaurante,folgas,escala,estoque,contagem,checklist,lembretes,motelli
```

**URL de suporte:** `https://motelli.com.br` · **URL de marketing:** `https://motelli.com.br`
**Direitos autorais:** `2026 Motelli`
**Build:** adicionar o 1.0.0 (o mais recente).

## 5. Informações de revisão do app

**Login necessário:** Sim → Nome de usuário: `917851` · Senha: `7721`

**Notas (pro revisor):**
```
O app não usa e-mail: o restaurante cadastra o funcionário e entrega um código de entrada de 6 números; o funcionário cria um PIN de 4 números.
Como entrar: na tela inicial, digite o código 917851 e toque em "Entrar"; na tela seguinte, digite o PIN 7721.
É a conta de teste "Avaliador Google" (sem dados reais de funcionário). As opções que aparecem dependem do que o restaurante libera para cada funcionário (folgas, lembretes, contagem, conferência, pagamentos).
A câmera é usada só para ler QR codes (o de entrada, no painel do restaurante, e o das etiquetas de estoque); nenhuma foto é gravada.
```

**Contato:** Rafael Locatelli Molder · telefone com +55 · `contato@motelli.com.br`
**Lançamento:** "Lançar automaticamente após a aprovação".

## 6. Enviar

**Adicionar para revisão** → **Enviar para revisão do app**. Export compliance: **Não** usa criptografia própria.
