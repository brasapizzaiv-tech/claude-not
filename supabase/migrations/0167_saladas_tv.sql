-- Saladas do dia (pra TV da cozinha): base fixa de saladas por categoria e,
-- por dia, quais entram no buffet. O cardápio do dia (cardapio_dia) e as
-- marmitas Kern (mkt_config) já existem e são reaproveitados.
create table if not exists public.saladas_base (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null unique,
  categoria  text not null check (categoria in ('Folhas','Maioneses','Cozidas','Cruas','Grãos','Conservas','Outros')),
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);

create table if not exists public.cardapio_dia_saladas (
  data       date not null,
  salada_id  uuid not null references public.saladas_base (id) on delete cascade,
  primary key (data, salada_id)
);

alter table public.saladas_base enable row level security;
alter table public.cardapio_dia_saladas enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename='saladas_base' and policyname='saladas_base_auth') then
    create policy saladas_base_auth on public.saladas_base for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='cardapio_dia_saladas' and policyname='cardapio_dia_saladas_auth') then
    create policy cardapio_dia_saladas_auth on public.cardapio_dia_saladas for all to authenticated using (true) with check (true);
  end if;
end $$;

-- Lista inicial típica de buffet (é mais fácil apagar do que digitar).
insert into public.saladas_base (nome, categoria) values
  ('Alface americana','Folhas'), ('Alface crespa','Folhas'), ('Rúcula','Folhas'), ('Agrião','Folhas'), ('Repolho roxo','Folhas'), ('Repolho verde','Folhas'), ('Couve','Folhas'),
  ('Maionese de batata','Maioneses'), ('Maionese de legumes','Maioneses'), ('Salpicão','Maioneses'), ('Maionese de cenoura','Maioneses'),
  ('Beterraba cozida','Cozidas'), ('Brócolis','Cozidas'), ('Couve-flor','Cozidas'), ('Vagem','Cozidas'), ('Chuchu','Cozidas'), ('Batata cozida','Cozidas'), ('Legumes cozidos','Cozidas'),
  ('Tomate','Cruas'), ('Cenoura ralada','Cruas'), ('Pepino','Cruas'), ('Cebola','Cruas'), ('Pimentão','Cruas'), ('Repolho ralado','Cruas'),
  ('Grão-de-bico','Grãos'), ('Lentilha','Grãos'), ('Feijão branco','Grãos'), ('Milho','Grãos'), ('Ervilha','Grãos'),
  ('Pepino em conserva','Conservas'), ('Azeitona','Conservas'), ('Palmito','Conservas'), ('Beterraba em conserva','Conservas'),
  ('Ovo cozido','Outros'), ('Vinagrete','Outros'), ('Tabule','Outros'), ('Salada de frutas','Outros')
on conflict (nome) do nothing;
