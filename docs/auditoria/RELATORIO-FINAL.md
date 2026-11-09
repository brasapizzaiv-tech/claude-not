# Auditoria geral — relatório final e plano de correção

De 30/10 a 09/11/2026. Versão no ar no fim: `0fcd92c`. Este arquivo junta as 7 etapas e diz **em que ordem corrigir**.
O detalhe de cada achado (onde, evidência, correção) está no relatório da etapa; aqui ficam só o ID, uma linha e o tamanho.

## Em uma página

**O sistema está de pé e os números batem.** Nas conferências feitas no banco:
- **Caixa:**
  - nenhuma comanda fechada com valor sem movimento desde 01/10;
  - os Pix pagos pelo QR do Sicoob casam com o caixa (207 de 207);
  - nenhuma NFC-e em dobro;
  - os 229 pagamentos no pinpad desde 05/11 estão fechados certos (1 a conferir, PAG-01).
- **Pedido das marmitas do Kern:** certo nos 76 dias.
- **Relógio de ponto:** sem buraco (NSR 1 a 2.985).
- **Fila de impressão:** vazia (0 de 7.934).
- **Telas:** as 126 abrem sem erro, nos dois temas, no computador e no celular.

**O que estava grave já foi corrigido durante a auditoria**, sempre com o seu OK e publicado fora do serviço:

| Corrigido | O que era |
|---|---|
| SEC-01 | Qualquer login conseguia virar dono |
| SEC-02 | O cadastro de contas estava aberto pra internet (você desligou) |
| SEC-03 · TEL-001 | Certificado digital, senha dele, token da Focus e CSC abertos pra qualquer funcionário |
| TEL-002 | `/clientes` (CPF, telefone, endereço) aberto pra qualquer funcionário |
| SEC-05 | PIN da equipe sem limite de tentativas e legível no banco; código de entrada reutilizável; cookie do garçom falsificável |
| SEC-12 | Webhook do WhatsApp e rotinas aceitavam chamada sem segredo |
| COD-002 | NFC-e do caixa declarava "dinheiro" em pagamento de cartão/Pix (~1.228 notas em 30 dias) |
| MAR-01 · MAR-02 | Rotação das marmitas do Kern ia atrasar a partir de 14/12; feriado "fecha" não fechava marmita, reserva nem cardápio |
| DES-010 | 3,9 s de espera depois de cada pagamento com cartão/Pix |
| BUG-001 a BUG-008 | Pinpad aprovado sem tela, comanda paga que ficava aberta, consumo inflado, fiado contando como faturamento, nota sem desconto e outros |
| SEC-17 | Backup confirmado (Supabase Pro) |

**O que sobra** são ~180 achados. Nenhum é crítico, e a maioria é baixo. Eles se juntam em quatro grupos:
1. **Cliques que apagam ou cancelam sem querer**, em telas de dinheiro e nota (ACE-01, ACE-02, TXT-01, EST-02, CX-01).
   É o mais urgente, porque o erro vem da pessoa e não deixa volta.
2. **Falha calada.** Quando algo de fora para, ninguém fica sabendo. Vale para:
   - o PC que imprime, a balança e o relógio de ponto;
   - a Receita (SEFAZ), o Sicoob, o WhatsApp e o Google.
3. **Segurança que ainda depende de "ninguém de dentro vai mexer"** (SEC-04). O banco separa uma empresa da outra, mas
   não separa funcionário de dono.
4. **Acabamento.** A moldura do painel está no padrão novo, mas o miolo de muitas telas não está. Também faltam rótulos
   nos campos, as janelas não fecham com Esc e os erros técnicos aparecem em inglês.

## Quanto ficou aberto, por etapa

| Etapa | Relatório | Achados | Corrigidos/fechados | Abertos |
|---|---|---|---|---|
| 1 Desempenho | `01-desempenho.md` | 10 | 1 (DES-010) | 9 |
| 2 Código | `02-codigo.md` | 12 | 1 (COD-002) | 11 |
| 3 Telas | `03-telas.md` | 8 | 2 (TEL-001/002) | 6 (TEL-006/007 seguem na Etapa 7) |
| 4 Lógica e dados | `04-bugs.md` | 58 | 4 (MAR-01/02 corrigidos; FIS-03 e FIN-01 decididos por você) | 54 |
| 5 Segurança | `05-seguranca-banco.md` | 19 | 6 (SEC-01/02/03/05/12/17) | 13 (SEC-13 = EST-03) |
| 6 Integrações | `06-integracoes.md` | 49 | 0 | 49 |
| 7 Interface | `07-interface.md` | 36 | 0 | 36 |
| **Total** | | **192** | **14** | **~178** |

---

## O plano: 7 ondas

Cada onda é um pacote que você aprova de uma vez ("pode corrigir a onda 1"). Valem as regras de sempre:
- **Publicar só fora do serviço** (almoço 11:30–14:00 de segunda a sábado; noite 18:30–22:00 só sexta e sábado), e
  perguntar "posso publicar agora?" antes de cada publicação.
- **Migration sempre ensaiada** numa transação desfeita antes de aplicar.
- **Nada de gravação financeira em produção sem o seu OK.** As correções mudam o código, não os dados antigos.
- **Cada onda termina conferida em produção** e anotada no relatório da etapa.

Tamanho: **P** = até meia hora · **M** = algumas horas · **G** = um dia ou mais.

### Onda 0 — Só você (sem código, pode ser hoje)

| # | O que fazer | De onde |
|---|---|---|
| 1 | Extrato da Bin: o cartão de **R$ 48,90 da comanda 246, em 05/11** (NSU 031323, Lecard Voucher) entrou? | PAG-01 |
| 2 | Extrato do Sicoob: algum dos 9 QR "cancelados" (R$ 313,41, de 24/09 a 27/10) ou o de R$ 29,80 de 28/10 foi pago? | PAG-02 |
| 3 | Painel da Focus: as 62 NFC-e em contingência (a maioria de 13 a 17/10) foram confirmadas? | NFE-01 |
| 4 | Google Cloud: pôr um teto de gasto por dia na chave do Maps | CRN-02 |
| 5 | Primeira nota real do caixa no cartão, emitida na mão: conferir se saiu "cartão" e não "dinheiro" | COD-002 |
| 6 | Decidir: os telefones do Kern recebem o "saiu/entregue" do WhatsApp? | MSG-06 |
| 7 | Decidir: Pix pelo QR do Sicoob (sem taxa) × Pix na máquina (com taxa). Desde 16/10 foi tudo na máquina | Etapa 6 |
| 8 | Decidir: liberar o zoom em `/pedir` e `/cotar`? | ACE-09 |
| 9 | Decidir: site e app das marmitas ficam com visual próprio? | Etapa 7 |
| 10 | Decidir: o que fazer com as exclusões de comanda da balança antes do Z (regra de motivo, quem pode) | CX-02 |

### Onda 1 — Dinheiro e nota fiscal: cliques que apagam, cancelam ou duplicam (recomendo começar por aqui)

| ID | O que corrige | Tam. |
|---|---|---|
| ACE-01 | "Tem certeza?" que não impede a exclusão (Apagar pedido da Conferência, Remover categoria) | P |
| ACE-02 + TXT-03 | Confirmação e conferência de erro em Estornar nota (não apagar conta paga), Excluir fechamento, Remover lançamento, e as outras 10 ações da lista | P |
| TXT-01 | Botões claros nas 14 janelas de cancelar: [Voltar] [Cancelar a nota] no lugar de [Cancelar] [Salvar] | P |
| EST-02 | "Remover" contagem com confirmação e sem apagar contagem finalizada | P |
| EST-01 + EST-03/SEC-13 | Salvar no painel não apaga o que o contador gravou pelo link; link não grava em contagem finalizada | M |
| CX-01 | Não deixar excluir comanda paga de recebimento conjunto | P |
| CX-04 | Dois caixas recebendo a mesma conta | M |
| CX-06 | Desconto de 100% sem motivo | P |
| CX-03 | Saldo cliente/Compra da equipe lançados antes de saber o que receber | P |
| CX-05 | Resposta perdida depois de gravar desfaz o cartão | M |
| PAG-01 | "Desfeito" deduzido vira "a conferir", aparece em Cartões (TEF) e no Z | P |
| PAG-02 + PAG-10 | Cancelar o QR também no Sicoob; rotina que reconsulta os cancelados e os "aguardando" | P |
| PAG-03 | Cancelamento no pinpad só com caixa aberto e sem estorno em dobro | P |
| PAG-04 | Tempo limite nas chamadas ao Sicoob | P |
| NFE-01 | Consultar depois as NFC-e em contingência/processando; trava contra nota em dobro também olha "processando" | M |
| FIS-01 | Linha da fila presa em "emitindo" | P |
| NFE-07 | Cancelamento de nota só marca "cancelado" depois de confirmado | P |
| EQP-01 · EQP-02 · EQP-03 | Acerto da semana: adiantamento igual ao da tela; 10% de semana paga não muda; folga de um turno | M |
| FIN-02 · FIN-03 · FIN-04 | Estorno da fatura como despesa; conciliação desfeita deixa órfão; CMV pela data de entrada | M |
| AGT-04 | Impressão em dobro quando a baixa falha (precisa de versão nova do agente no PC central) | P |

### Onda 2 — Falha calada: o sistema avisa quando algo de fora para

Uma tela **"Saúde do sistema"** (e um aviso na tela inicial e no caixa) com o último sinal de cada peça:

| ID | Peça | Tam. |
|---|---|---|
| AGT-02 · AGT-03 · AGT-05 | Agente de impressão: parado, travado, item que falha sem parar | M |
| AGT-01 | Balança: pesagem recusada vai pro painel (não fica escondida no PC) | P |
| AGT-06 | Relógio de ponto: última leitura e erro | P |
| PAG-05 | Pinpad: o sinal de vida passa a chegar (hoje cai no login); versão de cada PC | P |
| AGT-07 | Versão de cada agente; apagar o instalador antigo | P |
| NFE-03 · NFE-02 · NFE-05 · NFE-06 · CRN-06 | SEFAZ: última resposta, 656 como erro, aviso do certificado vencendo, não forçar busca antes da hora, cron fora do minuto :00 | M |
| MSG-05 | WhatsApp: aviso quando a conta cai ou o token vence | P |
| MAR-05 · CRN-05 · MSG-09 | Rotinas: registrar que rodaram (e não rodar 2x) | P |
| COD-004 | Erro do servidor deixa rastro (log) | M |
| AGT-08 | PC que reinicia sozinho: agentes ligam sem precisar entrar no Windows (você e eu no PC) | M |

Os agentes precisam de **versão nova instalada nos PCs** (impressão, balança, pinpad). Faço os instaladores e
passo o passo a passo; a instalação é você no PC.

### Onda 3 — Segurança que falta

| ID | O que corrige | Tam. |
|---|---|---|
| SEC-04 | Funcionário só lê e grava o que a permissão dele deixa, inclusive os links pessoais da equipe e o token dos agentes. Feito tela por tela, com o robô do funcionário conferindo | G |
| SEC-11 · SEC-10 | Ações do painel e do app da equipe conferindo permissão no servidor | M |
| COD-001 | Atualizar o Next.js (avisos críticos de segurança) e as bibliotecas | M |
| SEC-07 | Fotos da cotação: pasta não listável e só imagem | P |
| SEC-06 | App das marmitas: senha, limite de tentativas, lista pública do Kern | M |
| SEC-12 (resto) | Rotinas sem aceitar a senha na URL (`?key=`) | P |
| SEC-15 | Banco com uma segunda camada (anon sem permissão em tudo) | M |
| AGT-11 · AGT-12 · PAG-09 | Senha do relógio protegida no PC; portas locais da balança e do pinpad só pro sistema | P |
| SEC-16 | LGPD: pedido de exclusão e o que a lei manda guardar | M |
| MSG-03 | Apps nativos só abrem o nosso site por dentro (precisa versão nova nas lojas) | M |

### Onda 4 — Velocidade

| ID | O que melhora | Tam. |
|---|---|---|
| DES-006 | `/pedir` no celular em 4G: 23,5 s (fotos em tamanho cheio) | P |
| DES-003 · SEC-18 | Índices que faltam | P |
| DES-002 | `/financeiro/banco`: 1,6 s por clique | M |
| DES-008 | `/salao/notas-fiscais`: 0,9 s | P |
| DES-001 | Todo clique do painel confere o login 3 vezes (~0,15 s a menos em cada) | M |
| DES-004 · DES-007 · DES-009 · DES-005 | Contagem, buffet, tela inicial, rotina da SEFAZ | M |

### Onda 5 — Antes de ligar o delivery próprio, o cashback, as campanhas ou a 2ª empresa

Hoje esses recursos estão desligados ou quase sem uso. Os achados abaixo só fazem estrago quando o recurso for
ligado, então ficam como **trava**: antes de ligar, corrigir.

| Quando ligar… | Corrigir antes |
|---|---|
| Delivery próprio (`/pedir`) | DEL-01 e DEL-02 (Pix do app no caixa e conferido pelo servidor), DEL-03 a DEL-13, SEC-08/DEL-13 (telefone digitado), CRN-01 e CRN-02 (Google), ACE-05, MSG-04 |
| Cashback | SEC-09 |
| Campanhas de WhatsApp | MSG-01, MSG-02, MSG-07, MSG-08 (e a decisão do MSG-06) |
| Segunda empresa | SEC-14, MAR-09, AGT-13, VIS-02, ACE-08 |

### Onda 6 — Interface e acessibilidade

| ID | O que corrige | Tam. |
|---|---|---|
| VIS-03 · VIS-04 | Texto branco em botão laranja; cartão "Abrir caixa" legível | P |
| VIS-01 · TEL-006 | Tema escuro: textos de estado legíveis (codemod pros tokens) | M |
| TXT-02 | Erro do banco traduzido ("Já existe um com esse nome", não "duplicate key…") | M |
| ACE-03 / VIS-14 | Uma `<Janela>` só: fecha com Esc, prende o foco | M |
| ACE-04 · ACE-06 · ACE-07 | Rótulos nos campos, avisos que o leitor de tela fala, botões de símbolo com nome | M |
| VIS-05 | Botões que chamam o servidor viram `<BotaoAcao>` (os 11 que aceitam clique dobrado primeiro) | M |
| VIS-06 · VIS-07 | Quiosque da balança, `/cotar`, `/contar`, `/folga` e login no padrão novo | M |
| TEL-003 · TEL-004 · TEL-005 | Janela do fornecedor sem rolagem; erro de hidratação em 6 telas; tela inicial cortada no celular | P |
| TEL-007 · VIS-10 · VIS-11 · VIS-16 · VIS-17 · VIS-18 | Toque ≥ 44px, peças prontas, raios, filtros, títulos, botões e campos | G |
| ACE-08 · ACE-10 · ACE-11 · ACE-12 · VIS-08 · VIS-09 · VIS-12 · VIS-13 · VIS-15 · VIS-19 | O resto da interface | M |

### Onda 7 — Arrumação (baixos)

COD-003, COD-005 a COD-012 · CX-07 a CX-12 · FIS-02, FIS-04 a FIS-06 · FIN-05 a FIN-08 · EST-04 a EST-06 · EQP-04 ·
MAR-03, MAR-04, MAR-06 a MAR-08 · NFE-04, NFE-08 · PAG-06 a PAG-08 · AGT-09, AGT-10 · MSG-10 · CRN-03, CRN-04,
CRN-07 a CRN-09 · TXT-04 a TXT-06 · SEC-19 · TEL-008 (fica pública de propósito; só anotar).

Alguns baixos valem antes, se der tempo:
- **TXT-05:** o nome padrão "Contagem DD/MM" sai com o dia seguinte depois das 21h.
- **MAR-03:** o pedido do Kern pode sair em dobro se a rotina e o botão rodarem juntos.
- **PAG-06:** o voucher é lançado como débito, então a NFC-e sai com o tipo errado.

---

## Como vai ser a correção

1. Você escolhe a onda (recomendo **Onda 0 hoje** e **Onda 1** como primeira de código).
2. Corrijo, testo (testes, ensaio de migration, robô só leitura quando dá) e mostro o que mudou.
3. Pergunto "posso publicar agora?" e publico fora do serviço.
4. Confiro em produção e marco o achado como corrigido no relatório da etapa e aqui.

**No fim de tudo:** apagar os dois perfis do robô (`perfil-robo` com o seu login e `perfil-funcionario`). Eles ficam
até o fim das correções porque servem pra conferir cada onda.

## O que a auditoria não cobriu

- **Clicar e gravar de verdade:** salvar, pagar, emitir. Sem banco de teste (decisão da Etapa 0), isso foi verificado só
  lendo o código.
- **Leitor de tela de verdade** (TalkBack, VoiceOver), **TV e quiosque no tamanho real**, e os **apps nos aparelhos**.
- **Logs:** da Vercel, dos PCs do restaurante e dos painéis da Meta, do Firebase e do Google Cloud.
- **Os apps do TeimoFit** e a câmera do buffet (desligada).

## Onde está cada coisa

| Arquivo | O quê |
|---|---|
| `PROGRESSO.md` | Diário da auditoria, decisões e regras |
| `00-inventario.md` | Mapa do sistema: telas, rotas, rotinas, agentes, serviços |
| `01-desempenho.md` a `07-interface.md` | Os achados de cada etapa, com evidência e correção |
| `prints/` | Prints da Etapa 3, só neste PC (fora do git) |
| `scripts/auditoria/` | Robôs e consultas, todos só leitura |
