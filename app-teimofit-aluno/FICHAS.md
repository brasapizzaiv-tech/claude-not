# TeimoFit (app do aluno) — fichas da Play e da App Store (pra copiar e colar)

Mesmo caminho do Motelli Equipe (`app-equipe/PLAY-FICHA.md` e
`app-equipe/APPSTORE-FICHA.md`), nas mesmas contas: Play "Motelli" e Apple do
Rafael. Gráficos: `node scripts/teimofit-graficos.mjs`.

- Identificador: `br.com.teimofit.aluno` (pra sempre depois de publicado)
- Nome na loja: **TeimoFit** · SKU (Apple): `teimofit-aluno`
- Política de privacidade: `https://teimofit.com.br/privacidade`
- Contato: `privacidade@teimofit.com.br` (**criar antes de enviar**) · site `https://teimofit.com.br`

## Descrição breve (Play, até 80 caracteres) / Subtítulo (Apple, até 30)

```
Seus treinos, sua agenda e a sua evolução.
```
Apple (30): `Treinos, agenda e evolução`

## Descrição completa

```
O TeimoFit é o app dos alunos das academias e personal trainers que usam o TeimoFit. Na primeira vez, entre com o código de 6 números (ou o QR code) que o seu professor mostrar e crie o seu PIN. Depois, é só o celular e o PIN — de qualquer aparelho.

O QUE VOCÊ FAZ NO APP
• Vê o treino do dia e começa com um toque.
• Marca cada exercício enquanto treina, com cronômetro, o vídeo do exercício e o descanso entre as séries.
• Anota a carga que usou — e vê a carga subir no gráfico.
• Diz como foi o treino e conversa com o professor sobre ele.
• Acompanha a frequência da semana e do mês.
• Marca, troca e desmarca aulas na agenda (quando a academia usa a agenda).
• Preenche a sua anamnese e vê as suas avaliações físicas e medidas.

Sem internet no meio do treino? O que você marcou fica guardado no celular e é enviado sozinho quando o sinal voltar.

O que aparece para você depende do que a sua academia usa.

PRA QUEM É
Para alunos de academias e personal trainers que usam o TeimoFit. Não é um app de treino sozinho: o treino é montado pelo seu professor.

Dúvidas sobre o app ou sobre os seus dados: privacidade@teimofit.com.br
```

## Gráficos

| Item | Arquivo |
|---|---|
| Ícone 512×512 (Play) | `public/icons/teimofit-aluno-512.png` |
| Destaque 1024×500 (Play) | `public/play/teimofit-aluno-capa-1024x500.png` |
| Cabeçalho 3840×1646 (Apple) | `public/play/teimofit-aluno-cabecalho-3840x1646.png` |
| Capturas (mínimo 2) | no celular, com o aluno de teste: Início, Execução do treino, Treino concluído, Minha ficha (Evolução) |

## Categoria

Play: **Saúde e fitness**. Apple: **Saúde e fitness** (secundária: Estilo de vida).

## Acesso para os revisores (Play "Detalhes do login" / Apple "Notas de revisão")

```
O app é para alunos de academias. Use o aluno de teste da academia de demonstração:
Na primeira tela, celular (51) 99900-0009 e PIN 2580 → Entrar.
(Ou "Tenho um código": 428325.)
Ele já tem uma rotina montada: Início → INICIAR TREINO mostra a execução com cronômetro.
```

## Conteúdo do app (Play → Política → Conteúdo do app)

- Anúncios: **Não** · ID de publicidade: **não usa**.
- Classificação: "Utilitário, produtividade, comunicação ou outro"; NÃO em tudo → Livre.
- Público-alvo: **13 anos ou mais** (adolescente treina com autorização do responsável — ver a política). Não é para crianças.
- Saúde: o app **tem recursos de saúde e condicionamento físico** → preencher a **declaração de apps de saúde**: "Condicionamento físico / acompanhamento de exercícios"; não é dispositivo médico; não faz diagnóstico.

### Segurança dos dados

Coleta ou compartilha? **Sim.** Criptografado em trânsito? **Sim.** Exclusão a pedido? **Sim** (`https://teimofit.com.br/privacidade#apagar`).

| Categoria | Tipo | Coletado | Compartilhado | Opcional | Finalidade |
|---|---|---|---|---|---|
| Informações pessoais | Nome, número de telefone | Sim | Não | Não | Funcionalidade do app, gerenciamento da conta |
| Saúde e condicionamento físico | Informações de saúde (anamnese, lesões, remédios) | Sim | Não | Sim | Funcionalidade do app |
| Saúde e condicionamento físico | Informações de condicionamento físico (treinos, cargas, medidas) | Sim | Não | Não | Funcionalidade do app |
| Fotos e vídeos | Fotos (fotos de progresso, enviadas pela academia) | Sim | Não | Sim | Funcionalidade do app |
| Mensagens | Outras mensagens no app (conversa com o professor) | Sim | Não | Sim | Funcionalidade do app |
| Atividade no app | Outras ações (aulas marcadas, treinos feitos) | Sim | Não | Não | Funcionalidade do app |
| IDs | IDs do usuário (código, link pessoal) | Sim | Não | Não | Gerenciamento da conta |

NÃO marcar: localização, contatos, informações financeiras, dados de navegação. A câmera só lê o QR de entrada, nada é gravado.

### Apple — Privacidade do app

Dados **vinculados** ao usuário, **sem rastreamento**: Informações de contato (nome, telefone), Saúde e condicionamento físico (saúde, condicionamento), Fotos, Conteúdo do usuário (mensagens), Identificadores (ID do usuário), Uso (interação). Finalidade de todos: funcionalidade do app.

## Notas da versão (1.0.0)

```
Primeira versão do TeimoFit: entrada por celular e PIN, código ou QR code; treino do dia com cronômetro; agenda; ficha e evolução.
```
