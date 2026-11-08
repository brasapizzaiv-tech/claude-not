# Etapa 3 — Varredura de todas as telas

Feita em 08/11/2026 (domingo à noite, fora do serviço), na produção (`www.brasarestaurante.com.br`). Só leitura: o robô
cortava no navegador toda requisição que não fosse GET (nenhum botão gravou), além de localhost (pinpad e balança),
sites de fora e janelas novas. Cortes registrados: os POST que algumas telas fazem ao abrir (`/pedir`, `/delivery/config`,
`/impressao`, `/notas`, nota avulsa) e `connect.facebook.net`.

Scripts (só leitura): `scripts/auditoria/varrer-telas.mjs` (telas × 3 tamanhos × 2 temas, sem login, token inválido,
cliques seguros), `scripts/auditoria/varrer-funcionario.mjs` (login de funcionário × permissões) e
`scripts/auditoria/conferir-fiscal-funcionario.mjs` (prova da correção do TEL-001).

**Prints:** `docs/auditoria/prints/` (292 arquivos). Ficam **só neste PC**: mostram dados reais e o repositório é
público (a pasta tem um `.gitignore`). Os 3 prints de `/fiscal` foram apagados (mostravam o token antes da correção).

## Números

| O quê | Resultado |
|---|---|
| Telas abertas | 127 de 150 (as outras: 18 links com token e 2 TV, testados com valor inválido; `/cotacoes/[id]/fornecedores` e `/balanca-teste` de fora de propósito; `/delivery/campanhas/[id]` sem exemplo no banco) |
| Combinações (tela × tamanho × tema) | 761; 468 sem nenhum aviso |
| Tamanhos | computador 1440×900, notebook 1280×720, celular 390×844; tablet 1024×768 em `/cozinha`, `/rodizio` e quiosque |
| Tema escuro aplicado de verdade | 380 de 380 |
| Rolagem lateral, botão fora da tela, requisição falhando (4xx/5xx), erro no console | **0** |
| Erro do React (hidratação) | 6 telas (TEL-004) |
| Sem login | as 126 telas de dentro mandam pro login; só `/e/[id]` abre (é pública de propósito, TEL-008) |
| Token ou chave inválidos | os 20 links mostram mensagem clara ("Link inválido", "Entre com o PIN"); nenhum em branco ou com erro |
| Funcionário em tela de dono | login de funcionário com 8 permissões: 0 telas abertas sem permissão, 0 barradas tendo permissão. Mas 6 rotas sem módulo abriam pra todo mundo (TEL-001, TEL-002) |
| Cliques seguros (abre, confere, fecha) | 40 telas, 116 cliques, 1 problema (TEL-003) |

## Achados

### [TEL-001] A configuração fiscal abria pra qualquer funcionário, com o token da Focus e o CSC — **corrigido**
- Severidade: **crítico**
- O que acontecia: `/fiscal` não estava em nenhum módulo, então qualquer pessoa logada abria. A tela trazia preenchidos o
  token de produção da Focus (emite e cancela nota da empresa) e o CSC. `salvarConfigFiscal` e a nota de teste não
  conferiam permissão. A policy de `config_fiscal` deixava qualquer logado da empresa ler e gravar tudo direto pela API.
- Evidência: robô com login de funcionário (papel funcionário, sem Financeiro) abriu `/fiscal`, `/fiscal/perfis` e
  `/formas-pagamento` (esta só grava pro dono).
- **Corrigido em 08/11 (OK do Rafael: "só com o dono"; commit `89d91ab` + migration 0275):** rotas só do dono
  (`/usuarios`, `/fiscal`, `/formas-pagamento`, `/aparencia`); a tela não mostra token nem CSC (vazio mantém o atual); a
  configuração é lida no servidor, filtrada pela empresa da comanda/nota; policy: funcionário lê só as chaves que não são
  segredo e grava só o liga/desliga da nota automática. Conferido com o mesmo login: as 3 telas mandam pro início e a
  API não devolve mais token nem CSC (22 chaves visíveis, nenhuma secreta).
- Trocar o token da Focus: o Rafael decidiu não trocar.
- Falta: a 1ª nota real do caixa (segunda 09/11) confirma a emissão com a leitura nova.

### [TEL-002] `/clientes` abria pra qualquer funcionário, e salvar/excluir cliente não conferia nada — **corrigido**
- Severidade: alto (dados pessoais: CPF, telefone, endereço de 3 mil clientes)
- **Corrigido junto do TEL-001:** `/clientes` pede Salão, PDV, Delivery ou Financeiro (middleware, menu e as duas ações).
  A policy da tabela `clientes` continua aberta pra quem é da empresa (o caixa busca cliente); revisar na Etapa 5.

### [TEL-003] Janela de fornecedor maior que a tela e sem rolagem: o Salvar some no notebook
- Severidade: médio
- Onde: `src/app/(painel)/fornecedores/client.tsx:156`, `fixed inset-0 flex items-center` sem altura máxima nem rolagem.
- O que acontece: a janela "Novo fornecedor"/"Editar" tem ~1.040 px de altura. Num notebook de 720 px, o topo (Nome) e
  o rodapé (Salvar) ficam cortados e a página atrás não rola.
- Evidência: clique em "+ Adicionar" e "Editar" (print `fornecedores__clique-Editar.png`, local).
- Mesmo padrão (janela centrada sem `max-h` + `overflow-y-auto` perto da abertura) em mais ~24 lugares, a conferir
  um por um porque muitas são curtas: categorias, checklists (modelos ×2, revisão), colaboradores (×2), contagem (×2),
  comparar cotação, perfis fiscais, produtos, retiradas, caixa (`acoes.tsx`, `pagar-parte.tsx`), quiosque (×3), app do
  entregador, scanner do `/eu`, `delivery-pedido-ui.tsx:143` e `dialogo.tsx`. O Fechamento Z, clientes, colaboradores
  (cadastro), contagem avulsa e retiradas (`:277`) já rolam.
- Correção proposta: um componente de janela único (`max-h-[calc(100dvh-2rem)] overflow-y-auto`) e trocar os 25.
- Esforço: P–M · Risco: baixo

### [TEL-004] Erro de hidratação do React em 6 telas: a tela é desenhada duas vezes
- Severidade: médio
- Onde e por quê:
  - `/cozinha`: o relógio do topo (`cozinha-client.tsx:115`) formata a hora **sem fuso**; o servidor (UTC) desenha
    22:50 e o tablet 19:50. Erro #418.
  - `/delivery/[id]`, `/etiquetas`, `/etiquetas/[id]`, `/notas/sefaz`: #418 (texto diferente entre servidor e navegador),
    o mesmo tipo de causa (texto que depende de "agora": tempo do pedido, "vencida", data).
  - `/delivery/areas`: #419 (o servidor falhou ao montar e o React passou a montar só no navegador; provável o mapa).
- O que acontece: quem olha vê a hora certa, porque o React refaz tudo no navegador. Mas a tela pisca e custa o dobro
  pra abrir (na cozinha, a cada abertura do tablet).
- Correção proposta: `timeZone: "America/Sao_Paulo"` em toda formatação de hora; texto que depende de "agora" só
  depois de montar no navegador; o mapa de áreas carregado só no navegador.
- Esforço: P · Risco: baixo

### [TEL-005] Tela inicial no celular: dois blocos cortados na direita
- Severidade: médio (é a primeira tela de todo mundo)
- Onde: `/dashboard` em 390 px (print `dashboard__celular-claro.png`, local).
- O que acontece: no cartão Delivery, o terceiro número ("entregue") sai cortado na borda; em "Precisa de você", o
  contador de "Cotações aguardam resposta de 103 fornecedores" sai cortado. O robô não marcou sozinho porque o cartão
  esconde o que sobra (overflow escondido), visto no print.
- Correção proposta: no celular, os três números do delivery em grade que cabe (ou rolagem própria) e o contador quebrando
  linha.
- Esforço: P · Risco: nenhum

### [TEL-006] Contraste baixo em 55 telas (pior: os selos de setor dos checklists)
- Severidade: baixo a médio (vai pra Etapa 7)
- O pior: selos de setor nos checklists, no tema claro: Cozinha 1,6:1, Copa 1,7:1, Caixa 2,4:1, Salão 3,0:1
  (`/checklists`, `/checklists/historico`, `/checklists/modelos`, `/checklists/revisao`). Praticamente ilegível.
- No tema escuro, valores em dinheiro e textos de destaque ficam em 3,1 a 3,9:1 (financeiro, conferência, ponto,
  cotações, assiduidade). Causa provável: cor crua do Tailwind em vez dos tokens — 829 usos de `text-red/emerald/green/
  amber/blue/orange-500/600/700` em 188 arquivos, contra a regra do projeto ("só por token").
- No claro, perto do limite (3,9 a 4,4:1): textos secundários em conferência, contagem, etiquetas, cofre.
- Correção proposta: trocar os selos por `pilula-*`; nas telas antigas, trocar cor crua por token (pode ser por grupo de
  telas, junto da Etapa 7).

### [TEL-007] Botões pequenos demais no celular em 69 telas
- Severidade: baixo (Etapa 7)
- Botões com menos de 40 px no celular (a regra do projeto é 44): o recorde é `/clientes` (os "Editar/Remover" de cada
  linha), depois `/salao/notas-fiscais`, `/produtos` e `/salao/cardapio`. São telas de escritório, quase sempre usadas no
  computador; o que importa mais é o que roda no celular (`/garcom`, `/eu`, `/entrega`, `/pedir`), que passou.

### [TEL-008] `/e/[id]` (etiqueta pelo QR) abre sem login
- Severidade: a avaliar na Etapa 5 (já anotado na Etapa 0)
- É de propósito (quem escaneia a etiqueta vê a validade). A proteção é o id ser impossível de adivinhar.

## O que não deu pra testar e por quê

- **Estados** (lista vazia, carregando, erro de rede, dado gigante): exigem criar ou apagar dados, ou derrubar a rede no
  meio de uma ação. Em produção e só leitura não dá. Por leitura: as telas de lista têm mensagem de vazio (ex.: "Nenhum
  pedido", "Nenhuma comanda aberta"); quedas de conexão nos fluxos de dinheiro mostram aviso ("Sem conexão. Tente de
  novo."). Pra testar de verdade: um banco de teste (o Rafael preferiu não ter, Etapa 0).
- **Formulários** (validação, máscaras, duplo clique): o salvar é POST e estava cortado. Por leitura: `<Enviar>` e
  `<BotaoAcao>` travam o segundo clique; os 13 botões que chamam o servidor direto (ex.: `receberDelivery`,
  `definirStatusDelivery`, ponto) usam `disabled={proc}`, e o recebimento do delivery ainda recusa pedido já pago. Não
  há máscara comum: telefone, CPF, CNPJ e CEP são texto livre e o servidor tira tudo que não é número; cada tela formata
  do seu jeito na exibição.
- **TV** (`/tv`, `/tv/mural`) na resolução dela: precisa da chave, que não está neste PC. Testado só com chave inválida
  (mensagem certa). Medir com a chave numa próxima rodada.
- **App da equipe e do entregador**: só com token inválido (link pessoal real abriria a conta de alguém).

## Falsos alarmes do robô (pra não virar achado)

- "Texto cortado" nos campos de busca (`/dashboard`, `/delivery`, `/pedir`, `/salao`): é o texto de exemplo do campo; no
  print aparece inteiro.
- Parte do "contraste baixo" é texto dentro de componente desativado ou sobre imagem, onde a conta não vale.

## Resultado por tela

Só o tipo de problema e em que tema/fase (sem texto da tela: o repositório é público). "ok" = nada nos 3 tamanhos e 2
temas.

| Tela | Situação | O que apareceu (tema/fase) |
|---|---|---|
| `/aparencia` | ok |  |
| `/cardapio-do-dia` | problemas | contraste (claro, escuro) |
| `/categorias` | ok |  |
| `/checklists` | problemas | contraste (claro) |
| `/checklists/apontamentos` | ok |  |
| `/checklists/historico` | problemas | contraste (claro) |
| `/checklists/modelos` | problemas | contraste (claro) |
| `/checklists/revisao` | problemas | contraste (claro, escuro) |
| `/clientes` | ok |  |
| `/cofre` | problemas | contraste (claro) |
| `/colaboradores` | problemas | contraste (claro, escuro) |
| `/colaboradores/[id]` | ok |  |
| `/colaboradores/assiduidade` | problemas | contraste (escuro) |
| `/colaboradores/cadastros` | ok |  |
| `/colaboradores/ponto` | problemas | contraste (escuro) |
| `/colaboradores/ponto/diario` | ok |  |
| `/colaboradores/ponto/espelhos` | ok |  |
| `/colaboradores/ponto/horarios` | ok |  |
| `/colaboradores/ponto/horarios/[id]` | ok |  |
| `/colaboradores/ponto/regras` | ok |  |
| `/colaboradores/ponto/relatorios` | ok |  |
| `/colaboradores/semana` | ok |  |
| `/conferencia` | problemas | contraste (claro) |
| `/conferencia/[id]` | problemas | contraste (claro, escuro) |
| `/conferencia/divergencias` | problemas | contraste (claro, escuro) |
| `/conferencia/novo` | ok |  |
| `/contagens` | ok |  |
| `/contagens/[id]` | problemas | contraste (claro, escuro) |
| `/contagens/[id]/atribuir` | ok |  |
| `/contagens/agendamentos` | ok |  |
| `/contagens/consumo` | ok |  |
| `/contar/[token]` | ok (token inválido) |  |
| `/cotacoes` | ok |  |
| `/cotacoes/[id]` | problemas | contraste (escuro) |
| `/cotacoes/[id]/comparar` | problemas | contraste (escuro) |
| `/cotacoes/[id]/pedidos` | ok |  |
| `/cotar/[token]` | ok (token inválido) |  |
| `/cozinha` | problemas | erro do React (claro, escuro); contraste (claro, escuro) |
| `/cozinha/recados` | problemas | contraste (escuro) |
| `/cozinha/relatorio` | ok |  |
| `/dashboard` | problemas | blocos cortados no celular (TEL-005) |
| `/delivery` | ok (o "texto cortado" é falso alarme) |  |
| `/delivery/[id]` | problemas | erro do React (claro, escuro); contraste (claro, escuro) |
| `/delivery/areas` | problemas | erro do React (claro, escuro) |
| `/delivery/campanhas` | ok |  |
| `/delivery/campanhas/[id]` | não aberta | sem campanha no banco pra exemplo |
| `/delivery/campanhas/nova` | ok |  |
| `/delivery/cashback` | ok |  |
| `/delivery/config` | problemas | contraste (claro, escuro) |
| `/delivery/cupons` | ok |  |
| `/delivery/entregadores` | ok |  |
| `/delivery/entregadores/acerto` | ok |  |
| `/delivery/entregadores/caixa` | ok |  |
| `/delivery/gatilhos` | problemas | contraste (escuro) |
| `/delivery/kern` | ok |  |
| `/delivery/novo` | problemas | contraste (claro, escuro) |
| `/delivery/relatorios` | ok |  |
| `/delivery/vitrine` | ok |  |
| `/delivery/whatsapp` | problemas | contraste (escuro) |
| `/e/[id]` | problemas | contraste (claro, escuro); abre sem login (TEL-008) |
| `/entrega` | ok |  |
| `/entrega/[token]` | ok (token inválido) |  |
| `/etiquetas` | problemas | erro do React (claro, escuro); contraste (claro, escuro) |
| `/etiquetas/[id]` | problemas | erro do React (claro, escuro) |
| `/etiquetas/impressas` | ok |  |
| `/etiquetas/itens` | ok |  |
| `/etiquetas/scanner` | ok |  |
| `/eu/[token]` e as 12 telas do app da equipe | ok (token inválido) |  |
| `/feriados` | ok |  |
| `/financeiro` | problemas | contraste (claro, escuro) |
| `/financeiro/banco` | problemas | contraste (claro, escuro) |
| `/financeiro/buffet` | problemas | contraste (claro) |
| `/financeiro/caixa` | ok |  |
| `/financeiro/caixa/[id]` | ok |  |
| `/financeiro/caixa/novo` | problemas | contraste (claro, escuro) |
| `/financeiro/categorias` | ok |  |
| `/financeiro/cmv` | problemas | contraste (claro, escuro) |
| `/financeiro/contas` | problemas | contraste (claro, escuro) |
| `/financeiro/dre` | problemas | contraste (escuro) |
| `/financeiro/fatura` | ok |  |
| `/financeiro/orcamento` | ok |  |
| `/financeiro/vendas` | problemas | contraste (claro) |
| `/financeiro/vendidos` | ok |  |
| `/fiscal` | problemas | aberta pra qualquer funcionário (TEL-001, corrigido) |
| `/fiscal/perfis` | problemas | contraste (claro); aberta pra qualquer funcionário (TEL-001, corrigido) |
| `/folga/[token]` | ok (token inválido) |  |
| `/folgas` | problemas | contraste (claro, escuro) |
| `/formas-pagamento` | problemas | aberta pra qualquer funcionário (TEL-001, corrigido) |
| `/fornecedores` | problemas | janela maior que a tela (TEL-003) |
| `/garcom` | ok |  |
| `/garcom-avulso/[token]` | ok (token inválido) |  |
| `/garcom/comanda/[id]` | problemas | contraste (claro, escuro) |
| `/garcom/mesa/[mesa]` | ok |  |
| `/impressao` | problemas | contraste (claro, escuro) |
| `/lembretes` | problemas | contraste (escuro) |
| `/login` | problemas | contraste (escuro) |
| `/motelli` | ok |  |
| `/motelli/privacidade` | ok |  |
| `/mural` | problemas | contraste (claro) |
| `/notas` | ok |  |
| `/notas/[id]` | problemas | contraste (claro) |
| `/notas/sefaz` | problemas | erro do React (claro, escuro) |
| `/pdv` | ok |  |
| `/pedir` | problemas | contraste (claro) |
| `/pedir/acompanhar/[id]` | ok |  |
| `/produtos` | problemas | contraste (claro, escuro) |
| `/reservas` | ok |  |
| `/reservas/hoje` | ok |  |
| `/retiradas` | problemas | contraste (claro, escuro) |
| `/salao` | ok (o "texto cortado" é falso alarme) |  |
| `/salao/balanca` | problemas | contraste (claro, escuro) |
| `/salao/balanca/quiosque` | problemas | contraste (claro, escuro) |
| `/salao/caixa` | problemas | contraste (claro, escuro) |
| `/salao/caixa/cortesias` | ok |  |
| `/salao/caixa/fechamentos` | problemas | contraste (claro) |
| `/salao/caixa/fiado` | problemas | contraste (escuro) |
| `/salao/caixa/movimentos` | problemas | contraste (escuro) |
| `/salao/caixa/movimentos/[id]` | ok |  |
| `/salao/caixa/pix` | ok |  |
| `/salao/caixa/sangrias` | problemas | contraste (claro) |
| `/salao/caixa/tef` | ok |  |
| `/salao/caixa/vales` | ok |  |
| `/salao/cancelados` | ok |  |
| `/salao/cardapio` | problemas | contraste (claro, escuro) |
| `/salao/cardapio/adicionais/[itemId]` | ok |  |
| `/salao/cardapio/combos/[id]` | ok |  |
| `/salao/comandas/[id]` | ok |  |
| `/salao/mesa/[mesa]` | problemas | contraste (escuro) |
| `/salao/notas-fiscais` | problemas | contraste (claro, escuro) |
| `/salao/notas-fiscais/avulsa` | ok |  |
| `/sistema` | problemas | contraste (claro) |
| `/solicitacoes` | problemas | contraste (claro, escuro) |
| `/tv` | ok (chave inválida) |  |
| `/tv/mural` | ok (chave inválida) |  |
| `/usuarios` | ok |  |
