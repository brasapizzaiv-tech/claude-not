-- Cardapio do dia: a equipe escreve no sistema (/cardapio-do-dia) e o site
-- publico mostra o do dia em www.brasarestaurante.com.br/cardapio.
-- Os itens vao um por linha, no formato do quadro: proteinas, carboidratos e
-- especial do dia. Os precos ja vem sugeridos pelo dia da semana, mas podem
-- ser mudados em cada dia.
create table if not exists public.cardapio_dia (
  data          date primary key,
  proteinas     text,
  carboidratos  text,
  especial      text,
  preco_livre   numeric,
  preco_kg      numeric,
  publicado     boolean not null default false,
  atualizado_em timestamptz not null default now()
);

alter table public.cardapio_dia enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename='cardapio_dia' and policyname='cardapio_dia_all') then
    create policy "cardapio_dia_all" on public.cardapio_dia
      for all to authenticated using (true) with check (true);
  end if;
end $$;
