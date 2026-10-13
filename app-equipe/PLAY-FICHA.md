# Motelli Equipe — ficha da Play Store (pra copiar e colar)

Mesmo caminho do Motelli Entregador (ver `app-entregador/PLAY-FICHA.md`), na
mesma conta da Play ("Motelli"). Gráficos: `node scripts/equipe-graficos.mjs`.

## 1. Criar o app (Play Console → Todos os apps → Criar app)

| Campo | Valor |
|---|---|
| Nome do app | `Motelli Equipe` |
| Idioma padrão | Português (Brasil) |
| App ou jogo | App |
| Gratuito ou pago | Gratuito |
| Declarações | marcar as duas |

## 2. Ficha da loja (Crescer → Presença na loja → Ficha da loja principal)

**Descrição breve** (até 80 caracteres):

```
O app de quem trabalha num restaurante Motelli: folgas, lembretes e contagem.
```

**Descrição completa:**

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

**Gráficos** (pasta "Motelli Equipe - enviar pra Play" na Área de Trabalho):

| Item | Arquivo |
|---|---|
| Ícone do app 512×512 | `1 - icone 512x512.png` |
| Imagem de destaque 1024×500 | `2 - capa 1024x500.png` |
| Capturas de tela (mínimo 2) | tirar no celular com o app aberto: tela de entrada (código), a tela inicial da equipe e uma tela de dentro (ex.: Minhas folgas ou Lembretes) |

**Categorização:** App · Categoria **Corporativo** (Business) · Tags: Produtividade, Restaurantes.

**Contato:** e-mail `contato@motelli.com.br` · site `https://motelli.com.br`.

## 3. Conteúdo do app (Política → Conteúdo do app)

- **Política de privacidade:** `https://motelli.com.br/privacidade`
- **Anúncios:** Não.
- **Classificação de conteúdo:** categoria "Utilitário, produtividade, comunicação ou outro"; NÃO em tudo. Resultado: Livre.
- **Público-alvo:** 18 anos ou mais. Não é para crianças.
- **App de notícias:** Não. **Governamental / saúde / financeiro:** Não / nenhum.
- **ID de publicidade:** Não usa.
- **Acesso ao app (Detalhes do login):** "Algumas funcionalidades são restritas" — usar o colaborador de teste "Avaliador Google" (o Claude cria na hora e passa o código e o PIN).

**Segurança dos dados:**

- Coleta ou compartilha dados? **Sim.** Criptografados em trânsito? **Sim.** Pedido de exclusão: **Sim**, `https://motelli.com.br/privacidade`.

| Categoria | Tipo | Coletado | Compartilhado | Opcional | Finalidade |
|---|---|---|---|---|---|
| Informações pessoais | Nome | Sim | Não | Não | Funcionalidade do app, gerenciamento da conta |
| IDs do usuário | IDs do usuário (código/link pessoal) | Sim | Não | Não | Funcionalidade do app, gerenciamento da conta |
| Informações financeiras | Outras informações financeiras (pagamentos da semana, compras internas) | Sim | Não | Não | Funcionalidade do app |
| Atividade no app | Outras ações no app (folgas, contagens, conferências, lembretes) | Sim | Não | Não | Funcionalidade do app |

NÃO marcar: localização, fotos/vídeos (a câmera só lê QR, nada é gravado), contatos, mensagens.

## 4. Versão de teste interno → produção

Subir o `MotelliEquipe-vN.aab` mais novo da pasta (Testar e lançar → Produção → Criar nova versão),
notas da versão:

```
<pt-BR>
Primeira versão do Motelli Equipe: entrada por código ou QR code, folgas, lembretes, contagem, conferência de pedidos e pagamentos da semana.
</pt-BR>
```

Depois de salvar, clicar em **Avançar** até **Iniciar lançamento para Produção** (não deixar como rascunho — foi o que travou o Entregador em 13/10).
