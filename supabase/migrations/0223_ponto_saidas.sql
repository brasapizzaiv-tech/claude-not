-- RELATÓRIOS DE PONTO + AJUSTES DO DIA (Colaboradores > Relatórios de ponto)
--
-- 1. Horário de SAÍDA do turno do dia (horas previstas, extras e faltantes).
--    Igual ao "Horário Restaurante" do RHiD: seg a sáb, 14:00.
alter table public.assiduidade_config
  add column if not exists saidas jsonb not null default '{"1":"14:00","2":"14:00","3":"14:00","4":"14:00","5":"14:00","6":"14:00"}';

-- 2. Justificativas: o atestado vira um tipo. "abono" = ausência abonada pela
--    casa (não é falta e não tira o prêmio); "atestado" tira o prêmio do mês.
alter table public.atestados
  add column if not exists tipo text not null default 'atestado',
  add column if not exists criado_por uuid;
alter table public.atestados drop constraint if exists atestados_tipo_check;
alter table public.atestados add constraint atestados_tipo_check check (tipo in ('atestado', 'abono'));

-- 3. Batida incluída à mão (esqueceu de bater) ou vinda do AFD do RHiD.
alter table public.ponto_batidas
  add column if not exists origem text not null default 'relogio',
  add column if not exists obs text,
  add column if not exists criado_por uuid;
alter table public.ponto_batidas drop constraint if exists ponto_batidas_origem_check;
alter table public.ponto_batidas add constraint ponto_batidas_origem_check check (origem in ('relogio', 'afd', 'manual'));

-- 4. Arquivo do atestado (foto ou PDF): bucket privado, por empresa.
insert into storage.buckets (id, name, public)
values ('atestados', 'atestados', false)
on conflict (id) do nothing;
drop policy if exists atestados_arquivos on storage.objects;
create policy atestados_arquivos on storage.objects for all to authenticated
  using (bucket_id = 'atestados' and (storage.foldername(name))[1] = public.empresa_atual()::text)
  with check (bucket_id = 'atestados' and (storage.foldername(name))[1] = public.empresa_atual()::text);
