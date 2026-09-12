-- Saladas: o buffet segue um PADRÃO POR DIA DA SEMANA (a folha da cozinha),
-- e o cadastro por data vira exceção. A TV usa a data se houver marcação;
-- senão, o padrão do dia da semana. A base passa a ser a lista real da Brasa.
create table if not exists public.saladas_semana (
  dow        integer not null check (dow between 0 and 6),   -- 0 = domingo
  salada_id  uuid not null references public.saladas_base (id) on delete cascade,
  primary key (dow, salada_id)
);
alter table public.saladas_semana enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename='saladas_semana' and policyname='saladas_semana_auth') then
    create policy saladas_semana_auth on public.saladas_semana for all to authenticated using (true) with check (true);
  end if;
end $$;

-- Troca a lista genérica pela lista real (folha da cozinha, set/2026).
update public.saladas_base set ativo = false;
insert into public.saladas_base (nome, categoria, ativo) values
  ('Alface','Folhas',true), ('Alface Verde','Folhas',true), ('Alface Roxo','Folhas',true), ('Rúcula','Folhas',true), ('Broto','Folhas',true),
  ('Mix de Repolho','Folhas',true), ('Mix de Couve (couve folha, repolho, cenoura, orégano e sal)','Folhas',true),
  ('Maionese','Maioneses',true),
  ('Cenoura Cozida','Cozidas',true), ('Beterraba Cozida','Cozidas',true), ('Vagem','Cozidas',true), ('Brócolis','Cozidas',true),
  ('Chuchu','Cozidas',true), ('Couve Flor','Cozidas',true), ('Ovo Cozido','Cozidas',true),
  ('Mix de Couve-flor (tomate cereja, cebola roxa, azeitona, orégano e sal)','Cozidas',true),
  ('Tomate','Cruas',true), ('Cenoura Ralada','Cruas',true), ('Beterraba Ralada','Cruas',true), ('Pepino','Cruas',true), ('Alho Poró','Cruas',true),
  ('Trigo','Grãos',true), ('Grão de Bico','Grãos',true),
  ('Mix Conservas','Conservas',true),
  ('Banana com Maracujá','Outros',true), ('Sunomono','Outros',true)
on conflict (nome) do update set ativo = true, categoria = excluded.categoria;

-- Limpa da base o que era só exemplo e nunca foi usado.
delete from public.saladas_base b
 where b.ativo = false
   and not exists (select 1 from public.cardapio_dia_saladas s where s.salada_id = b.id);

-- Padrão da semana (1 = segunda … 6 = sábado).
with p(dow, nome) as (values
  (1,'Maionese'),(1,'Alface'),(1,'Rúcula'),(1,'Tomate'),(1,'Cenoura Cozida'),(1,'Beterraba Ralada'),(1,'Vagem'),(1,'Pepino'),(1,'Brócolis'),(1,'Mix de Repolho'),
  (2,'Maionese'),(2,'Alface'),(2,'Rúcula'),(2,'Tomate'),(2,'Cenoura Ralada'),(2,'Beterraba Cozida'),(2,'Chuchu'),(2,'Couve Flor'),(2,'Ovo Cozido'),(2,'Trigo'),
  (3,'Maionese'),(3,'Alface'),(3,'Rúcula'),(3,'Tomate'),(3,'Cenoura Cozida'),(3,'Beterraba Ralada'),(3,'Brócolis'),(3,'Mix de Couve-flor (tomate cereja, cebola roxa, azeitona, orégano e sal)'),(3,'Vagem'),(3,'Pepino'),
  (4,'Maionese'),(4,'Alface'),(4,'Rúcula'),(4,'Tomate'),(4,'Cenoura Ralada'),(4,'Beterraba Cozida'),(4,'Chuchu'),(4,'Mix de Couve (couve folha, repolho, cenoura, orégano e sal)'),(4,'Ovo Cozido'),(4,'Trigo'),
  (5,'Maionese'),(5,'Alface Verde'),(5,'Alface Roxo'),(5,'Rúcula'),(5,'Tomate'),(5,'Cenoura Cozida'),(5,'Beterraba Ralada'),(5,'Brócolis'),(5,'Broto'),(5,'Mix Conservas'),(5,'Pepino'),(5,'Grão de Bico'),
  (6,'Maionese'),(6,'Alface'),(6,'Alface Roxo'),(6,'Rúcula'),(6,'Tomate'),(6,'Cenoura Ralada'),(6,'Beterraba Cozida'),(6,'Brócolis'),(6,'Broto'),(6,'Mix Conservas'),(6,'Trigo'),(6,'Banana com Maracujá'),(6,'Sunomono'),(6,'Alho Poró')
)
insert into public.saladas_semana (dow, salada_id)
select p.dow, b.id from p join public.saladas_base b on b.nome = p.nome
on conflict do nothing;
