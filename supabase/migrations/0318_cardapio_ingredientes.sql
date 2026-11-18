-- Pedido do Rafael (18/11/2026): no cardápio do dia de 18/11 saiu "Berinjela à
-- pizzaiola" e "Ratatouille" — dois pratos com berinjela. A IA lê cada prato do
-- catálogo (ingrediente de destaque + jeito de preparo); quando a chefe monta o
-- dia, o sistema avisa se dois pratos repetem. Ela pode publicar mesmo assim
-- (com o motivo) e aí o Rafael recebe o aviso no celular.

-- 1) O que a IA leu de cada prato (null = ainda não leu).
alter table public.cardapio_itens
  add column if not exists destaques text[],
  add column if not exists preparo text,
  add column if not exists analise_em timestamptz,
  add column if not exists analise_por text,
  add column if not exists analise_erro text,
  add column if not exists reaproveitar jsonb;

comment on column public.cardapio_itens.destaques is
  'Ingredientes que dão nome/identidade ao prato (minúsculas, singular: berinjela, abobrinha, peixe). Bases do buffet (frango, carne, arroz, feijão, batata, massa...) ficam de fora. Vazio = nada a comparar; null = IA ainda não leu.';
comment on column public.cardapio_itens.preparo is
  'Jeito de preparo marcante (lasanha, empanado, escondidinho, strogonoff...) ou null. Grelhado/assado/cozido não contam.';
comment on column public.cardapio_itens.reaproveitar is
  'Ideias da IA pra usar a SOBRA deste prato no dia seguinte: [{nome, grupo}] (ex.: carreteiro -> bolinho de carreteiro). Pedido do Rafael, 18/11/2026.';
comment on column public.cardapio_itens.analise_por is
  '''ia'' quando veio da leitura automática; o nome da pessoa quando alguém corrigiu à mão (a IA não sobrescreve).';

create index if not exists cardapio_itens_sem_analise on public.cardapio_itens (empresa_id) where analise_em is null;

-- 2) Publicações com prato repetido que a pessoa decidiu manter.
create table if not exists public.cardapio_alertas (
  id bigint generated always as identity primary key,
  empresa_id uuid not null default public.empresa_atual() references public.empresas(id),
  data date not null,
  conflitos jsonb not null,            -- [{tipo:'ingrediente'|'preparo', chave:'berinjela', pratos:['...','...']}]
  motivo text check (motivo is null or char_length(motivo) <= 500),
  por_nome text,
  por_colab_id uuid,
  por_user_id uuid,
  avisados integer not null default 0, -- quantos celulares receberam
  criado_em timestamptz not null default now(),
  visto_em timestamptz
);

create index if not exists cardapio_alertas_empresa on public.cardapio_alertas (empresa_id, criado_em desc);

alter table public.cardapio_alertas enable row level security;

drop policy if exists cardapio_alertas_empresa on public.cardapio_alertas;
create policy cardapio_alertas_empresa on public.cardapio_alertas
  for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- 3) Quem recebe o aviso no celular (caixinha em Colaboradores).
alter table public.colaboradores
  add column if not exists recebe_alerta_cardapio boolean not null default false;

-- O Rafael pediu pra ele receber (colaborador "Rafael" da Brasa).
update public.colaboradores
   set recebe_alerta_cardapio = true
 where id = '0d271d87-d1fb-4647-8518-74b2bbed7b4f';

-- 4) Uso da IA sem pessoa logada (leitura automática dos pratos) entra no
--    mesmo registro de custo do Ajudante.
alter table public.ajudante_uso alter column user_id drop not null;
