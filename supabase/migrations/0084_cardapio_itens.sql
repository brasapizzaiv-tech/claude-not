-- Catalogo de itens do buffet, para montar o cardapio do dia clicando em vez
-- de digitar. O campo usos conta quantas vezes o item ja foi ao cardapio: e o
-- que coloca os mais frequentes no topo da busca.
create table if not exists public.cardapio_itens (
  id        uuid primary key default gen_random_uuid(),
  grupo     text not null check (grupo in ('proteinas','carboidratos','especial')),
  nome      text not null,
  usos      int  not null default 0,
  ativo     boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (grupo, nome)
);

alter table public.cardapio_itens enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename='cardapio_itens' and policyname='cardapio_itens_all') then
    create policy "cardapio_itens_all" on public.cardapio_itens
      for all to authenticated using (true) with check (true);
  end if;
end $$;

-- Comeco de catalogo: os itens do quadro de terca que o Rafael mandou.
insert into public.cardapio_itens (grupo, nome) values
  ('proteinas','Molho bolonhesa'),
  ('proteinas','Frango acebolado'),
  ('proteinas','Suíno alho e óleo'),
  ('proteinas','Frango empanado'),
  ('proteinas','Bife à cavalo'),
  ('carboidratos','Arroz branco'),
  ('carboidratos','Arroz integral'),
  ('carboidratos','Feijão'),
  ('carboidratos','Arroz tropeiro'),
  ('carboidratos','Massa caseira'),
  ('carboidratos','Penne à carbonara'),
  ('carboidratos','Legumes na manteiga'),
  ('carboidratos','Batata doce ao forno'),
  ('carboidratos','Escondidinho de aipim com frango'),
  ('carboidratos','Anéis de cebola'),
  ('carboidratos','Batata frita'),
  ('carboidratos','Polenta frita'),
  ('especial','Pastel de chocolate')
on conflict (grupo, nome) do nothing;
