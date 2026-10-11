-- CÓDIGO DE ENTRADA DO APP DO ENTREGADOR
-- Em vez de colar o link pessoal (/entrega/{token}), o motoboy abre o app e
-- digita um código de 6 números (ou lê o QR no painel). O app é um só na loja
-- pra todos os clientes, então quem traduz código → endereço é o site da marca
-- (motelli.com.br/api/entrega/ativar), que olha o domínio da empresa dona.

-- Domínio onde roda o sistema de cada empresa (o app abre https://{dominio}/entrega/{token}).
alter table public.empresas add column if not exists dominio text;
update public.empresas set dominio = 'www.brasarestaurante.com.br'
  where id = '00000000-0000-4000-8000-000000000001' and dominio is null;

-- Código único no sistema inteiro (a consulta é central, entre empresas).
create or replace function public.gerar_codigo_entregador() returns text
language plpgsql volatile set search_path = public as $$
declare c text;
begin
  loop
    c := lpad((floor(random() * 1000000))::int::text, 6, '0');
    exit when not exists (select 1 from public.entregadores where codigo = c);
  end loop;
  return c;
end $$;
revoke all on function public.gerar_codigo_entregador() from public, anon;

alter table public.entregadores add column if not exists codigo text;
update public.entregadores set codigo = public.gerar_codigo_entregador() where codigo is null;
alter table public.entregadores alter column codigo set default public.gerar_codigo_entregador();
create unique index if not exists entregadores_codigo_uk on public.entregadores (codigo);

-- Tentativas de entrada pelo código (trava quem fica chutando: 6 números são
-- só 1 milhão de combinações). Só o servidor (service role) lê e grava.
create table if not exists public.entrega_ativacao_tentativas (
  id bigserial primary key,
  ip text not null,
  ok boolean not null default false,
  em timestamptz not null default now()
);
create index if not exists entrega_ativacao_tentativas_ip_em on public.entrega_ativacao_tentativas (ip, em);
alter table public.entrega_ativacao_tentativas enable row level security;
revoke all on public.entrega_ativacao_tentativas from anon, authenticated;
grant select, insert, delete on public.entrega_ativacao_tentativas to service_role;
grant usage, select on sequence public.entrega_ativacao_tentativas_id_seq to service_role;
