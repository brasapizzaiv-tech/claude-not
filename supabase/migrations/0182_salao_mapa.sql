-- Etapa 4 do design: o mapa do salão na tela inicial.
--
-- Três coisas que o desenho novo pede e que o sistema não tinha.

-- ---------------------------------------------------------------------------
-- 1) Salão e Deck
-- ---------------------------------------------------------------------------
-- Antes disso "Deck" só existia como texto solto no formulário de reservas:
-- não havia nenhum lugar dizendo que a mesa 12 é do salão e a 40 é do deck.
-- Fica por faixa de números, na mesma configuração do salão. Editável na tela
-- de Cardápio e configurações; estes valores são só o ponto de partida.
insert into public.pdv_config (chave, valor)
values (
  'mesa_grupos',
  '[{"nome":"Salão","de":1,"ate":30},{"nome":"Deck","de":31,"ate":46}]'
)
on conflict (chave) do nothing;

-- ---------------------------------------------------------------------------
-- 2) "Conta pedida"
-- ---------------------------------------------------------------------------
-- A comanda só sabia estar aberta ou fechada. O mapa precisa do meio do
-- caminho: a mesa já pediu a conta e ainda não pagou.
--
-- O Rafael decidiu que marcam os dois, o garçom pelo celular e o caixa. Por
-- isso guardamos QUEM marcou: quando a responsabilidade é de todo mundo, é
-- fácil ninguém marcar e depois ninguém saber de onde veio.
--
-- O status continua 'aberta' — isto aqui não fecha nada, só sinaliza.
alter table public.pdv_comandas
  add column if not exists conta_pedida_em  timestamptz,
  add column if not exists conta_pedida_por text;

create index if not exists pdv_comandas_conta_pedida_idx
  on public.pdv_comandas (conta_pedida_em)
  where conta_pedida_em is not null;

-- ---------------------------------------------------------------------------
-- 3) Quantas mesas a casa tem
-- ---------------------------------------------------------------------------
-- Estava escrito em dois lugares que discordavam: a configuração do salão
-- dizia 40 e o rodízio tinha 46 preso no código e nesta trava do banco.
-- Agora a configuração (pdv_config.qtd_mesas) é a única verdade; a trava fica
-- só como rede de segurança contra número absurdo.
alter table public.pedidos_rodizio drop constraint if exists pedidos_rodizio_mesa_check;
alter table public.pedidos_rodizio
  add constraint pedidos_rodizio_mesa_check check (mesa between 1 and 500);
