-- Log de itens cancelados (auditoria): guarda o motivo, já que o item é apagado
-- da comanda.
create table if not exists public.pdv_itens_cancelados (
  id             uuid primary key default gen_random_uuid(),
  comanda_numero integer,
  mesa           text,
  descricao      text,
  qtd            numeric,
  valor          numeric,
  motivo         text not null,
  cancelado_por  uuid,
  cancelado_em   timestamptz not null default now()
);

alter table public.pdv_itens_cancelados enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='pdv_itens_cancelados' and policyname='pic_all') then
    create policy "pic_all" on public.pdv_itens_cancelados for all to authenticated using (true) with check (true);
  end if;
end $$;
