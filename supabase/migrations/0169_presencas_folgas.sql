-- Semana e 10%: quando alguém da escala fixa é DESMARCADO num dia (folga,
-- falta), isso fica registrado — e o botão "Preencher com a escala fixa" não
-- traz a pessoa de volta naquele dia/turno. Marcar de novo apaga o registro.
create table if not exists public.presencas_folgas (
  colaborador_id uuid not null references public.colaboradores (id) on delete cascade,
  data           date not null,
  turno          text not null check (turno in ('dia', 'noite')),
  criado_em      timestamptz not null default now(),
  primary key (colaborador_id, data, turno)
);
alter table public.presencas_folgas enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename='presencas_folgas' and policyname='presencas_folgas_auth') then
    create policy presencas_folgas_auth on public.presencas_folgas for all to authenticated using (true) with check (true);
  end if;
end $$;
