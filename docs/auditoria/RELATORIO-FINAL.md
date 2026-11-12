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

## Andamento das correções

### Onda 1 — feita em 09/11/2026 (com o OK do Rafael, "pode começar" e "pode fazer tbm")

| Lote | Commit | O que corrigiu | No ar |
|---|---|---|---|
| A | `41cfaa3`, `ccade6e` | ACE-01, ACE-02 (+ TXT-03 nessas ações), TXT-01, EST-02. Peças novas: `enviarSeConfirmar` (`src/lib/enviar-se-confirmar.ts`, com testes), `FormConfirmado`; a caixa de pergunta abre fora da transição (o "Estornar" travava) | 09/11 11:35, conferido pelo robô sem gravar |
| B1 | `e5a2737` | CX-01, CX-03, CX-04, CX-06, PAG-01 ("a conferir" em Cartões (TEF)), PAG-02, PAG-03, PAG-04, PAG-10 (parte) | a publicar |
| B2 | `b25e8b2` | NFE-01 (rotina `/api/fiscal/conferir`, migration 0281), FIS-01, NFE-07, NFE-08, PAG-05, e os 9 pontos da revisão independente do B1 | a publicar |
| C | `85beb45` | EST-01, EST-03 / SEC-13 (migration 0282) | a publicar |
| D | `cb677a7` | EQP-01, EQP-03, FIN-02, FIN-03 | a publicar |
| E | `9338d02` | AGT-04 e parte do AGT-03: agente de impressão 1.2.1 (instalar no PC central) | a instalar |
| — | `baa29fe` | CX-05 (resposta perdida depois de gravar não desfaz o cartão; caixa, PDV e delivery) | a publicar |
| — | `d78c71e` | EQP-02 (divisão do 10% congelada no pagamento, migration 0283); FIN-04 decidido: CMV pela emissão | a publicar |

Testes: 14 testes novos (`scripts/enviar-se-confirmar.test.mjs`, `scripts/conferir-notas.test.mjs`); 170 de 172 passam
(as 2 falhas são as antigas do delivery, COD-008). Migrations 0281, 0282 e 0283 ensaiadas em transação desfeita.

Ficou de fora da Onda 1: nada dos itens listados. Depende do Rafael: conferir os extratos (Onda 0) e instalar o agente 1.2.1.
(Agente 1.2.1 instalado em 09/11 no DESKTOP-2C8O2JU; 5 testes saíram uma vez cada.)

### Fora das ondas, em 09/11/2026 (pedidos do Rafael)

| Commit | O que fez |
|---|---|
| `42fbbc2`, `4d91345`, `af7172a` | Cofre no pagamento da semana e no adiantamento: caixinha por pessoa, o sistema sugere as notas, arredonda pra cima até o real inteiro (migration 0284); botão "Tirar do cofre" para semana já paga em dinheiro |
| `6b34468` | Central de Impressões → Downloads: instaladores dos três agentes num bucket privado, link de 10 min (migration 0285) |
| — | Calibração da Elgin L42 Pro da cozinha (rolo BOPP 60×60): driver 60×61 / intervalo 2,5 mm, offset de coluna −40, deslocY 0; o pulo vinha da cola do rolo no rolo de borracha |

### Onda 2 — publicada em 09/11/2026 ~23h30 (commits `f3f963b`, `7baf048`; OK do Rafael: "pode" e "pode publicar quando terminar")

Tela nova **Saúde do sistema** (`/saude`, no menu Configurações) e faixa de aviso na tela inicial, no caixa e no delivery
quando alguma peça está parada. Migration **0286** (ensaiada em transação desfeita).

| ID | Como ficou |
|---|---|
| AGT-02 | Agente sem sinal há mais de 150 s e item esperando há mais de 1 min aparecem no aviso; comanda de cozinha com mais de 1 h fica **segurada** (não sai sozinha) com "Imprimir de novo" / "Tirar da fila" na Saúde |
| AGT-03 | Agente 1.3.0: tempo limite de 45 s na impressão pelo PDF (mata o SumatraPDF) e o sinal de vida manda a hora da última rodada completa; rodada parada há mais de 2 min = "travada" |
| AGT-05 | `impressao_fila.tentativas/ultimo_erro`; o agente 1.3.0 avisa cada falha (`/api/impressao/falha`); depois de 5 a fila desiste e a Saúde mostra |
| AGT-01 | Balança 1.2.4: 401/403/408/429 não tira a pesagem da fila; as recusadas dos últimos 3 dias vão no sinal de vida e aparecem em `/salao/balanca` e na Saúde |
| AGT-06 | Relógio de ponto: o pedido do último NSR (que só acontece depois de entrar no relógio) marca a leitura; sem leitura há 30 min = aviso (sem precisar de agente novo) |
| AGT-07 | Versão do agente de impressão gravada e mostrada na Central e na Saúde; balança e pinpad também; pasta `installer/` (1.0.0) apagada do git |
| PAG-05 | Pinpads aparecem na Saúde com versão e "sinal há X min" (o sinal já chegava desde a Onda 1) |
| NFE-03 | `config_sefaz` guarda a última resposta (código, motivo, hora) e a última busca boa; a tela da SEFAZ mostra; aviso com mais de 6 h sem busca boa; campo "Certificado vence em" (digitado pelo dono, o sistema não lê o certificado) com aviso 30 dias antes |
| NFE-02 | Busca forçada: automática no mínimo a cada 10 min, botão "Buscar itens agora" e "Reprocessar" no máximo 1 vez por hora, e nada depois de um 656. A busca esperta só força nos 30 min depois de manifestar (antes: de 15 em 15 min por 3 h) |
| 656 | Vira erro na tela (antes aparecia "✓ … 656") |
| NFE-05 · CRN-06 | Busca de hora em hora agora roda de 10 em 10 min a partir do :03 (`3,13,…,53`); a trava de 1 h decide, então não perde a vez por 1 s nem cai junto com a busca esperta do :00 |
| NFE-06 | Falha de gravação (não "já existe") para o NSU no documento: ele volta na próxima busca; na 3ª vez seguida segue e fica no registro de erros. Itens da nota que não gravam viram falha (antes a nota ficava "completa" vazia) |
| MSG-05 | WhatsApp na Saúde e na faixa do delivery: últimas mensagens falhando e quantas falharam em 24 h |
| MSG-09 · CRN-05 | Avisos no celular com tempo limite de 8 s e limpeza do token "not a valid FCM registration token"; resumo da manhã com trava do dia (`push_envios`); contagem agendada marca o dia antes de gerar |
| MAR-05 | As rotinas (contagem, Kern, limpeza, avisos, WhatsApp, conferência das notas, SEFAZ) gravam o último sinal em `saude_sinais` e respondem 500 quando falham; Kern que não rodou até 08:50 vira aviso |
| COD-004 | `registrarErro` grava em `erros_sistema` e no log: fila da nota do caixa, aviso de WhatsApp do pedido, avisos do celular, divergências da conferência, nota pendente da fila de impressão, importação da SEFAZ. A Saúde mostra os das últimas 24 h só pro dono |
| AGT-08 | **Não feito em código**: precisa de você no PC (login automático no Windows do PC central ou tarefa "ao iniciar"). Fica para quando você estiver no PC |

Testes: `scripts/saude.test.mjs` (5, trava da SEFAZ e horário de serviço); 182 de 184 passam (as 2 falhas são as antigas do
delivery, COD-008). Build ok. Revisão independente: 8 pontos, todos corrigidos antes de publicar (guarda do servidor na função das
contagens, idade da rodada pelo relógio do agente, trava do resumo só no "já existe", documento inválido não segura a SEFAZ,
trava de 1 h sempre gravada, padrão do fornecedor, filial do Kern sem pedido, permissão da /saude). Instaladores na página
Downloads: **impressão 1.3.0** e **balança 1.2.4** (falta instalar nos PCs). Conferido no ar sem gravar: Saúde, SEFAZ,
Downloads e aviso na tela inicial; rotinas e relógio de ponto gravando sinal; agente 1.2.1 com versão registrada.

### Onda 3 — em andamento (OK do Rafael: "pode seguir"); lote 1 publicado em 10/11/2026 ~06h45

| Lote | Commit | O que corrigiu |
|---|---|---|
| 1 | `5868b6f` | **SEC-11**: `exigirAcesso` nas 141 ações do painel que não conferiam permissão no servidor (garçom continua lançando item: `["/salao","/garcom"]`); desconto do delivery entre 0 e o subtotal; peso do quiosque até 8 kg; `emitirNfceComandasAdmin`/`imprimirNfceAdmin` só rodam com o cliente do servidor. **SEC-07**: foto da cotação por endereço assinado gerado no servidor, nome aleatório, 3 MB, só imagem, o celular reduz a foto; migration 0287 tira a listagem e o envio direto (conferido: anônimo lista 0 e o envio é recusado). **SEC-12** (resto): rotinas só pelo cabeçalho (`?key=` responde 401). **AGT-13**: balança e Central filtradas pela empresa |

| 2 | `4e1eebc` | **SEC-10** (migration 0288): funções de pedido do app da equipe exigem quem confere entrega, pedido/item/produto da própria empresa e pedido não conferido; remover só o item incluído pelo app. **SEC-06** (migration 0289): senhas das marmitas em scrypt (a antiga vira hash no 1º acerto), mínimo 6 e única; 5 erros por endereço ou 50 no total em 15 min travam 15 min (contagem atômica, acerto não zera); dono logado entra antes da trava; `/api/publico` sem matrícula (conferido no ar: 81 nomes, 0 matrículas) |

Revisão independente do lote 2: 5 pontos (trava burlável com tentativas simultâneas, acerto zerava a contagem, senha velha no navegador do dono travava o restaurante, cache de senha entre servidores, função auxiliar chamável), todos corrigidos antes de publicar (publicado 10/11 ~07h10). Pendente com o Rafael: trocar a senha de 4 dígitos do app das marmitas.

| 3 | `3eeee8a` | **COD-001**: Next.js e eslint-config-next 16.3.0 → 16.4.5 (avisos críticos), undici 8.12.4, node-forge 1.4.3, xmldom/source-map-js; sobra o xlsx (sem correção no npm; só quem tem Financeiro usa). **SEC-15** (migration 0290): anon sem permissão em tabela/sequência (só lê `empresas`, a única policy dele), padrão de tabela nova também; `scripts/migrate.mjs` não devolve mais ao anon e falha se alguma tabela do public estiver sem RLS. Conferido no ar (10/11 ~07h45): robô abriu 15 telas (os 2 avisos #418 em /cozinha e /etiquetas são o TEL-004 antigo), rotinas seguem rodando, anon recusado |

| 4 | `c0be492` | **AGT-12** (balança 1.2.5) e **PAG-09** (pinpad 0.9.15): porta local só aceita a página do sistema (origem do config.json, com e sem www, ou `origens`), loga a recusada; pinpad recusa corpo grande sem travar e perdeu o `/raw`. **AGT-11** (impressão 1.3.1): senha do relógio cifrada pelo Windows (DPAPI) no relogio.json, a antiga é cifrada ao ligar; desinstaladores da balança e do pinpad acham o .pid e só matam o processo se ainda for o nosso. Instaladores na página Downloads; **falta instalar nos PCs** |

| 5 | `a985d5e` | **SEC-04 fase A** (migration 0292): `impressao_config` e `mkt_config` só do dono pela sessão; `colaboradores.token/pin/codigo` e `entregadores.token/codigo` sem SELECT pra sessão (permissão por coluna, reaplicada pelo `migrate.mjs`); Colaboradores, ficha, Entregadores, Lembretes e Kern leem pelo servidor depois da permissão; `tem_permissao(modulo)` criada. Conferido no ar: telas abrem, 47 links pessoais aparecem pro dono |
| 5b | `b8bedbe` (+ 0293 `3a9…`) | **SEC-04 fase B, lote 1**: visão `colaboradores_dados` só leitura e só pra quem tem Colaboradores (0294); CPF, RG, PIS, CTPS, CNH, endereço, telefone, nascimento, pais, tipo sanguíneo, filhos e salário/diária fora da sessão na tabela (0295, publicada em 3 passos: visão → código → colunas). **0293** corrige a fase A (gerar código/cadastrar dava erro; ninguém foi afetado). Revisão: 3 pontos sérios (ponto inteiro vazio, trava de CPF repetido calada, visão gravável) corrigidos antes. Conferido no ar: 23 telas abrem com os dados |
| 5c | `9a3defa` | **SEC-04 fase B, lote 2** (migration 0296): 39 tabelas da equipe (ponto, presenças, semana/10%, adiantamentos, folgas, atestados, documentos, convites do garçom) e do dinheiro (lançamentos, notas, banco, fatura, faturamento, CMV, cofre) só abrem pra quem tem o módulo que as usa; arquivos de atestado/documento só com Colaboradores; `mesclar_produtos` e `consumo_periodos` viram definer com permissão e empresa conferidas. Sangria do caixa grava a despesa pelo servidor; tela inicial e mural leem presença/ponto/folgas pelo servidor. Ensaio por perfil: caixa e garçom 0 linhas no financeiro/notas/ponto/folgas/cofre e não gravam; dono e módulos certos iguais a antes; consumo médio idêntico. Revisão: nada sério, 5 menores corrigidos. Conferido no ar: 23 telas |
| 5d | `f7f1a0d` | **SEC-04 fase B, lote 3** (migration 0298): clientes (Salão/PDV/Delivery/Financeiro), fiado, Pix, TEF (Salão/PDV/Delivery), vales (Salão/PDV), cashback (Delivery/PDV), compras internas (Compras internas/Colaboradores/Notas), acertos e posições dos entregadores (Delivery). "Compra da equipe" e o saldo devedor no caixa pelo servidor. Ensaio por perfil: garçom, recepção e rodízio 0 linhas; caixa/delivery/dono iguais a antes. Conferido no ar: 16 telas. **SEC-04 completo** |
| 5e | `a27431e` | **SEC-16 LGPD** (migration 0299; decisões do Rafael 10/11: anonimizar a pedido, só desligar quem tem histórico, nada automático): `anonimizar_cliente(id)` tira nome, telefone, endereço e CPF/CNPJ do cadastro, pedidos, reservas, vales, mensagens, eventos, envios e carrinhos (valores, fiado, cashback e notas ficam; quem deve fiado não sai); "Remover" em Clientes pergunta e chama. 12 FKs do histórico da equipe viram RESTRICT. Ensaio desfeito: garçom e devedor recusados, colaborador com histórico não apaga |
| — | `3eaef2f`, `25b7387`, `34fc5ec` | Fora das ondas (pedidos do Rafael, 10/11): **NFC-e por recebimento** (migration 0297, `pdv_recebimentos`): cada pagamento do caixa sai com a nota só do que pagou (1 almoço + 0,5 Coca); item dividido não sai mais em KG. Revisão: 2 sérios (CPF de outra pessoa na nota; ordem migration→código) corrigidos antes. **Contas a pagar**: busca procura em todo o boleto, pelo valor e leva pra "Todas" (a lista já carregava tudo: 42/3.793/3.835) |
| — | `7160f99`, `3096890` | Fora das ondas (pedidos do Rafael): ler cupom NFC-e pelo QR (câmera ou leitor USB) em Notas; abrir o caixa com o troco nota por nota (migration 0291) |

Revisão independente do lote 1: 1 ponto sério (o app do garçom não lançaria itens) e 2 menores (foto HEIC, peso acima de 32 kg cobrado calado), corrigidos antes de publicar. Robô só leitura: 8 telas do painel abrem sem erro; rotinas seguem gravando sinal depois da publicação.

Falta na Onda 3: MSG-03 (apps nas lojas: código + versão nova nas lojas).

### Onda 4 — feita em 10/11/2026 (OK do Rafael: "pode seguir")

| Lote | Commit | O que foi |
|---|---|---|
| A | `10b505b` (0300, 0301) | DES-003/SEC-18: 15 índices (comandas por data, itens da nota, produto nas compras/contagem, lançamentos, conciliação, cotação, ponto…), índice repetido fora. 0301: `comandas_por_dia` (tela inicial, 8 consultas → 1) e `nfce_total_autorizado` (DES-008). DES-006: fotos com `loading="lazy"` (/pedir, cardápio, delivery). DES-005: rotina da SEFAZ conta itens junto. DES-009: mesas sem pré-carregar. Ensaio: comandas do dia 60→25 ms, referência da contagem 280→109 ms |
| B | `4ec20cf` (0302) | DES-002: conciliação traz só o mês (?mes=) e lançamentos de 8 meses antes a 4 depois (nenhuma sugestão perdida). DES-001: `src/lib/sessao.ts` (login e perfil uma vez por requisição) no layout, empresa e `exigirAcesso`; menu em paralelo. Medido no ar: conciliação 1,8 s → 0,9 s; telas simples ~0,62 → ~0,5 s |

| C | `6d5052b` (0303, 0304) | DES-008: Notas fiscais busca no banco (filtros no endereço, 100 por página, planilha com todas as que batem). DES-007: `buffet_pratos()` num JSON só. DES-006 parte 2: miniatura 400 px WebP no upload (sharp) + `scripts/gerar-miniaturas.mjs` (51 fotos, 6,4 MB → 436 KB). Medido no ar: Notas fiscais 1,2 s → 0,58 s; buffet 1,1 s → 0,44 s; /pedir no celular baixa 7 fotos, 76 KB ao abrir |

Onda 4 concluída. Fica só DES-004 reescrita (opcional: o índice já levou a referência da contagem de 280 a 109 ms).

### Onda 6 — em andamento (OK do Rafael: "podemos fazer a 6 primeiro"), 10/11/2026

| Lote | Commit | O que foi |
|---|---|---|
| 1 | `43de360` | VIS-03 (8 botões laranja com texto grafite), VIS-04 (Abrir caixa em .cartao-foco), TEL-005 (rodapé da tela inicial não corta no celular — conferido em 390 px), VIS-05 (10 botões com trava), TXT-02 (`explicarErro` em 148 retornos; repetido pelo código 23505), ACE-06 (50 role=alert, 87 role=status) |
| 2 | `e48b4ec` | ACE-03/VIS-14/TEL-003: `src/components/janela.tsx` (Esc, Tab preso, foco devolvido, rola) em 29 janelas — conferido no ar: janela do fornecedor em tela de 680 px abre com foco no Nome, Salvar alcançável, Esc fecha; a de Pagamento do caixa fica de fora (pinpad). ACE-07: 58 botões de símbolo com nome. ACE-04: ~176 campos com aria-label. TEL-004: cozinha, etiquetas, etiqueta e áreas de entrega sem erro de hidratação (conferido) |
| 3 | `4ef3306` | VIS-01/TEL-006: 541 textos de estado nos tokens ok/urgente/info; token novo **aviso** (paleta.ts + globals.css + .pilula-aviso) em 205 amarelos. VIS-11: 269 raios no padrão. VIS-13: 26 anéis de foco à mão fora. VIS-06/07: quiosque, /cotar, /contar, /folga e login com os pares claro+escuro nos tokens. Conferido no ar no tema escuro: tokens aplicados, 39 telas sem erro |
| 4 | `e05bce5` | ACE-08 (template "%s · empresa"; conferido: "Contas a pagar · Brasa Pizzaria e Restaurante"), ACE-10 (4 caixas do navegador + Dialogos em /cotar e /folga), ACE-11 (data com anel), VIS-19, VIS-09 (70 → info), ACE-12 (29 cabeçalhos, 82 tabelas com foco), TEL-007 (Clientes e Notas fiscais 44 px) |

| 5 | `2eba016` | VIS-16 (.filtro/.filtro-ativo/.filtro-contador, 11 filtros), VIS-12 (emoji → Icone), VIS-08 (cozinha/TV só tv-cores.ts), Financeiro e fatura alinhados pelo topo (pedido do Rafael; conferido: os 9 rótulos na mesma altura), EscolhaComBusca com estilo de campo, atalhos em .btn-secundario |

| extra | `c1ee681` · `0a5ab6e` · `bd7615b` | Moldura única `.pagina` (pedido do Rafael, 10/11): 114 telas com largura toda e a mesma margem (30 px/26 px); Frente de Caixa, Assiduidade, Checklists e Nota avulsa em colunas; 52 botões grafite → `.btn-principal`. Conferido por print em 1873 px: as 99 telas abertas começam a 30 px |
| 6 | `9743bf0` | VIS-17 (`.titulo-pagina` em 112 títulos; cabeçalhos do ponto em `.rotulo`), VIS-18 (43 botões laranja à mão → `.btn-principal`), VIS-10 (14 etiquetas → `.pilula-*`, cartões neutros de folgas/retiradas em `.cartao`), TEL-007 (Editar/Remover/Ocultar de Produtos e Cardápio com 44 px) |

| 7 | `6900d11` · `72093e7` | VIS-15: um leitor de câmera só (`components/leitor-qr.tsx`, ZXing) no leitor de etiquetas do painel (antes BarcodeDetector, não abria no iPhone), na baixa em lote do /eu, no garçom (QR + código de barras) e no entregador (aviso da Play mantido); jsQR fora do projeto. Etapa 1 testada pelo Rafael no celular; no ar conferido com câmera de teste (abre, desliga ao voltar, sem erro) |

| 8 | `6d6fc48` | VIS-18: `.campo` no globals.css; 136 campos em 89 arquivos (constantes locais e classes repetidas) passam a usar a peça |

**Onda 6 encerrada.**

### Onda 7 — arrumação (em andamento)

| Lote | Commit | O que corrigiu |
|---|---|---|
| 1 | `66751e4` | TXT-05 (nome padrão da cotação, data do comparar, validade do cashback e manipulação da etiqueta no fuso de SP; 18 mensagens de dinheiro com `moedaBR` — "R$ 1.234,50" em vez de "R$ 1234,50"/"R$ 105712.00"), MAR-03 (pedido da Kern reserva a linha do dia antes de criar o pedido: rotina e botão juntos não duplicam), PAG-06 (débito com bandeira de vale — LECARD VOUCHER, VR, ALELO, SODEXO, TICKET — entra na forma de vale no caixa, PDV e delivery; NFC-e sai 11; `scripts/forma-pela-bandeira.test.mjs`) |
| 2 | `37f5ba4` | COD-006 (saldo do fiado numa função só, `src/lib/fiado-saldo.ts`, buscando em páginas — tela do Fiado, busca de cliente no caixa, limite de crédito 2× e nota avulsa), COD-008 (testes do delivery acertados pra noite só sexta/sábado; `npm test` roda os 206 — todos passam), COD-010 (`@zxing/library` declarada), NFE-04 (recusa da SEFAZ com cStat vira erro com o motivo; 136/573 também marcam a nota como manifestada), CRN-07 (app das marmitas: sem conexão mostra "Tentar de novo" em vez de "abrem às undefined"; erro 500 genérico e registrado na Saúde), CRN-04 (horário da contagem agendada de 15 em 15 min, até 23:45, arredondado no servidor) | Testar no celular: garçom lendo cupom/cartão e entregador lendo cupom. Os cartões com borda que pintam estado (verde/vermelho/dashed) ficaram de propósito. Alinhamento visual não é pego pelo robô: conferir por print.
| 3 | `914fbdf` | COD-003 (nota automática decidida pelo TIPO da forma no servidor, igual à tela; "Juntos Sicredi", tipo outro, deixa de entrar na fila — decisão do Rafael), COD-005 (`.env.example` com as 26 variáveis (+ as do Sicredi) e pra que serve cada uma; README aponta pra ele), COD-007 (lint ignora cópias antigas, builds e bibliotecas copiadas: `npx eslint .` de 312 erros pra 0), COD-009 (`middleware.ts` → `proxy.ts`, sem o aviso do build), COD-011 (3 componentes e 5 exports sem uso apagados; rotas `/api/tv/camera`, `/api/rastreio`, `/sistema` e `/balanca-teste` apagadas com o OK do Rafael, e o passo a passo do Traccar saiu de Entregadores), COD-012 (registro órfão `0216_tv_camera.sql` apagado de `_migrations` em 11/11; README diz que número repetido não é erro) |
| 4 | `50984e1` | CX-07 (sai `pagarValores`, `receberComandas`, `fecharComanda`, `reabrirComanda`, `editarBuffet` e os 2 auxiliares delas — nada usava, 290 linhas), CX-08 (dividir item: a última parte leva o resto, R$ 90 em 3 fecha 90,00; a unidade da nota já seguia o `por_kg` do item), CX-09 (balança manual: "0.452" é 0,452 kg e não 452; peso acima de 8 kg ou tara maior que o peso avisam; a comanda guarda sempre o peso LÍQUIDO, igual ao quiosque, e a tara fica só de registro), CX-10 (serviço só à noite continua valendo depois da meia-noite, até 05:00; teste novo), CX-11 (sangria e suprimento recusam caixa já fechado) |
| 5 | `06f1fb2` | FIS-05 (CPF/CNPJ do consumidor confere o dígito antes de emitir — caixa, nota pendente, nota avulsa; documento errado do cadastro fica de fora em vez de derrubar a nota), FIN-05 (lançamento da nota arredondado no centavo), FIN-06 (parcela mensal no dia 29–31 vai pro último dia do mês, não pula fevereiro), FIN-07 (DRE e mais 18 consultas com `.limit(>1000)` — ponto, acerto da semana, relatório do rodízio, delivery, etiquetas, retiradas, pedidos de compra, app da equipe — buscam em páginas), FIN-08 (conciliar mais de um movimento na mesma conta avisa quando a soma não bate), MAR-09 parcial (Contas e Vencimentos do app da equipe filtram pela empresa; dar baixa só em conta da mesma empresa) |
| — | banco, 11/11 | FIN-05 (os 65 lançamentos de nota antigos arredondados no centavo) e CX-12 (balança começa em 201: cartões 1–200, balança 201+, automática 500+; comanda esquecida com valor já trava o Z e o garçom avisa cartão aberto, então não precisou de índice — um índice único quebraria a balança, que imprime o número antes de gravar) — com o OK do Rafael |
| 6 | `bc0fcdb` | EST-04 (apagar pedido da conferência: com nota ligada recusa e explica; apaga o pedido antes e o lançamento depois, sem ficar pela metade), EST-06 (acerto e complemento da semana: se o registro do acerto falha, a conta recém-lançada é desfeita — antes o 2º clique lançava a pessoa de novo), EQP-04 (10% de cada noite repartido em centavos pelo peso, a soma bate com o "a dividir"; `src/lib/dez-repartir.ts` + teste), MAR-04 (migration 0305: data padrão de contagens, cotações, folgas, lançamentos e pedidos no dia de São Paulo), MAR-06 (já estava certo: a hora da SEFAZ tem `timeZone`) |
| 7 | `5327b16` | CRN-03 (TV: com temperatura guardada espera no máximo 1,5 s pelo Open-Meteo; a atualização completa tem 8 s), CRN-08 (hora limite das marmitas vai até 08:30 — às 08:35 sai o pedido da Kern; o servidor recusa depois disso), CRN-09 (site: reserva sem resposta em 10 s segue pelo WhatsApp; cardápio que não carregou diz isso, não "não publicado"), PAG-07 (aviso no cadastro quando "Cartão" sem pinpad está ligado junto das formas com pinpad), SEC-19 parcial (`semCuringa`: "%" no cupom do app, no nome do garçom avulso e na categoria não casa mais com qualquer um) |
| 8 | `96491bc` | SEC-19 parcial (rotina diária apaga da fila de impressão o que foi impresso há mais de 60 dias; migration 0306 tira 3 índices repetidos). A `cotacao_itens_backup` FICA: não é tabela velha, é o "Desfazer" da cotação (a auditoria errou nesse ponto) |
| 9 | `30ad5f9` | FIS-02 (botão Consultar na lista de notas pra NF-e que ficou processando — autorizou, faz a baixa e o caixa combinados; com a Focus fora a linha não perde os dados), TXT-04 (regra de nomes no CLAUDE.md; caixa: tirar da conta é "Tirar desta conta" com ✕, não "Excluir item" com lixeira; conferência: "Excluir pedido" em tudo), TXT-06 (17 mensagens de reserva vagas — "Erro.", "Falhou", "Não deu certo." — viram "Não deu certo. Confira a internet e tente de novo."; lista vazia de clientes e produtos diz o próximo passo) |
| 10 | `150ead9` | FIS-06 (decisão do Rafael: buffet por quilo sai com o PESO real em KG e o preço do quilo que fecha o valor; livre ou sem peso sai 1 UN; pagamento em parte leva a fração do peso; `buffetNaNota` + teste; simulado em 211 comandas dos últimos 3 dias: 129 KG, 82 UN, todas fecham quantidade × preço) |
| 11 | `2e7db62` | MAR-07 (reserva do site: domingo, rodízio fora de sexta/sábado e o horário limite do mesmo dia — 11h45 almoço, 18h45 rodízio — agora também no servidor; depois de gravar confere a lotação de novo e desfaz a própria reserva se dois pegaram o último lugar juntos), MAR-08 (app das marmitas: as exceções de cardápio de qualquer dia carregam, não só de hoje−2; dois cliques no lançamento do administrador avisam "já tem pedido" em vez de "Erro interno") |
| 12 | `ed3a053` | PAG-08 (agente TEF 0.9.16: só aceita a resposta do pinpad com o mesmo id do pedido; uma atrasada de outra operação é descartada, anotada no log e no estado, e a espera continua), AGT-09 (agente da balança 1.2.6: o caminho antigo também manda id, então o reenvio não duplica; a pesagem feita sem internet chega com o código OFF no nome da comanda) — instaladores na página Downloads |
| 13 | `bfff492` | EST-05 (consumo médio conta a compra pela hora da CHEGADA: "Chegou" da equipe → conferência → dia de entrega 09:00; nota de pedido pela chegada; "Não veio" fora — migration 0307; medido: 145 → 144 trechos negativos, os outros são estoque que subiu sem nota nem pedido e a tela agora explica) |
| 14 | `766173a` | SEC-19 resto (migration 0308): reiniciar a numeração das comandas só com salão/PDV; tirar item pelo link da cotação fechada é recusado antes de apagar (a tela devolve o item e diz por quê); balança recusa pesagem acima de 30 kg (vai pra fila de erros do agente) e horário fora de 7 dias atrás a 5 min à frente vale "agora"; reservas do site: no máximo 3 por telefone em 24 h e 40 por hora; "Trocar o link" do entregador (o link e o QR antigos param na hora, sai código novo); app do entregador avisa ao marcar "Já pago" num pedido que o sistema não tem como pago. `/api/tef/` já era público; o celular e o PIN do `FICHAS.md` do TeimoFit são da conta de demonstração pros revisores das lojas (ficam). Ficam pra depois, só com OK: casas fixas nos 78 `numeric` e regra de valores nos 15 status. **FIS-04 fechado pela 0297** (nota por recebimento): 29 notas em 11/11, valor = pagamento, nenhuma em dobro, nenhum item depois da última nota. **FIS-06 conferido no ar**: 27 NFC-e com buffet em 11/11, todas autorizadas |

### Onda 5 — delivery próprio (/pedir), 12/11/2026 (OK do Rafael: "Delivery próprio (/pedir)")

| Lote | Commit | O que corrigiu |
|---|---|---|
| D1 | `2cfa73e` (12/11 ~09h10) | DEL-01 (Pix do app entra no caixa aberto, uma vez só — trava `pix_mov_id`, migration 0309; sem caixa aberto, a rotina lança quando abrir), DEL-02 (rotina `/api/delivery/pix` de 5 em 5 min confere o Pix; aparece na Saúde), DEL-03 (cobrança do app nasce em `pix_cobrancas`: lista de Pix e estorno acham; sem esse registro o QR não aparece e a cobrança é cancelada no banco), DEL-04 (já estava: `semCuringa`), DEL-05 (`clientes.telefone_digitos`, migration 0310, mesma regra do `src/lib/telefone.ts` — conferido nos 3.272 telefones; 1 par repetido fica pra juntar com OK), DEL-06 (cancelar pedido pago pergunta "Cancelar mesmo assim"), DEL-07 (item que não dá pra montar recusa o pedido dizendo qual), DEL-08 (comanda/itens não ficam soltos; "Receber" lança o caixa antes de marcar pago e o fiado depois do caixa), DEL-09 (boy não entrega pedido cancelado, nem no meio-tempo), DEL-10 e "pago em dobro" (Pix que cai em pedido cancelado ou já recebido vira `pago_devolver`, nunca vai pro caixa, a Saúde manda devolver), DEL-11 (`cupom_usar`/`cupom_devolver` no banco, só o servidor; cancelar devolve; "uma vez por cliente"), DEL-12 (aviso no painel do delivery: entregue sem receber de outro dia — hoje 1, o #1 de 14/10, R$ 27), SEC-08/DEL-13 (dados, histórico e cashback de um telefone só no aparelho que já RECEBEU um pedido com ele — cookie httpOnly + `pedir_aparelhos`, migration 0311; de outro aparelho pede, mas não usa cashback nem troca o cadastro), CRN-01 (mapa com tempo limite; "o mapa não respondeu" ≠ "endereço não encontrado"; Nominatim de reserva), CRN-02 (`geo_cache` por endereço e 30 cálculos por IP em 10 min), MSG-04 (GPS do boy pela rota fixa `/api/entrega/posicao`), ACE-05 (autocompletar e teclado de telefone no /pedir e em 6 telas do painel). Revisão independente: 8 pontos (venda em dobro no caixa com Pix pago depois do "Receber", cobrança sem registro, rotina pegando pedido antigo, telefone com 55 de 12 dígitos, corrida cancelar × Pix, aparelho liberado por um pedido falso, "uma vez por cliente" burlável, fiado em dobro ao repetir o "Receber") — todos corrigidos antes de publicar. Fica de fora: Pix devolvido não tira a venda do caixa (igual ao caixa do salão hoje) |
| D2 | a publicar | SEC-09 (cashback, migration 0312): as funções só aceitam o servidor ou quem tem Delivery/PDV, e pela sessão só cliente/comanda/pedido da própria empresa; o crédito do balcão é calculado no banco pelos itens da comanda fechada (o valor da tela é ignorado; ensaio: pedir base 99999 deu R$ 1,80 = 2% de R$ 90); usar saldo só em pedido/comanda daquele cliente ainda aberto e até o limite por pedido; devolver o usado só com a comanda aberta (balcão) ou pelo cancelamento (delivery); crédito da entrega limitado a itens − desconto mesmo com `cashback_base` mexido; `cashback_mov` pela sessão só leitura (gravar direto é recusado). Cashback segue DESLIGADO e sem nenhum movimento |

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
