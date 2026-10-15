-- NOTIFICAÇÕES NO CELULAR — app Motelli Equipe (etapa 2, 15/10/2026)
-- Cada celular com o app registra o token do Firebase (FCM) ligado ao
-- colaborador. O servidor manda os avisos (lembrete, folga respondida,
-- pedido pra conferir, pagamento da semana) pra esses tokens.

create table if not exists public.dispositivos_push (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.empresa_atual() references public.empresas(id),
  colaborador_id uuid not null references public.colaboradores(id) on delete cascade,
  token text not null unique,
  plataforma text not null default 'android' check (plataforma in ('android', 'ios')),
  criado_em timestamptz not null default now(),
  visto_em timestamptz not null default now()
);
create index if not exists dispositivos_push_colab on public.dispositivos_push (colaborador_id);
alter table public.dispositivos_push enable row level security;
-- Painel (logado) só lê os da empresa; quem grava é a função abaixo (app sem
-- login) e o servidor (service role, que apaga token morto).
drop policy if exists dispositivos_push_ler on public.dispositivos_push;
create policy dispositivos_push_ler on public.dispositivos_push for select to authenticated
  using (empresa_id = public.empresa_atual());
grant select on public.dispositivos_push to authenticated;
grant select, insert, update, delete on public.dispositivos_push to service_role;

-- O app (sem login) registra o token: valida link + PIN como as outras
-- colaborador_*. O mesmo celular trocando de pessoa ("Sair deste aparelho")
-- passa o token pra pessoa nova.
create or replace function public.colaborador_registrar_push(p_token text, p_pin text, p_push text, p_plataforma text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_pin text; v_emp uuid;
begin
  select id, pin, empresa_id into v_id, v_pin, v_emp from colaboradores where token = p_token and ativo;
  if not found then return jsonb_build_object('ok', false); end if;
  if v_pin is not null and v_pin <> p_pin then return jsonb_build_object('erro', 'pin'); end if;
  if coalesce(length(p_push), 0) < 20 or length(p_push) > 4096 then return jsonb_build_object('ok', false); end if;
  insert into dispositivos_push (empresa_id, colaborador_id, token, plataforma)
  values (v_emp, v_id, p_push, case when p_plataforma = 'ios' then 'ios' else 'android' end)
  on conflict (token) do update set colaborador_id = excluded.colaborador_id, empresa_id = excluded.empresa_id,
    plataforma = excluded.plataforma, visto_em = now();
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.colaborador_registrar_push(text, text, text, text) to anon, authenticated;

-- "Sair deste aparelho": o celular para de receber os avisos dessa pessoa.
create or replace function public.colaborador_remover_push(p_token text, p_push text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  delete from dispositivos_push d
   using colaboradores c
   where d.token = p_push and d.colaborador_id = c.id and c.token = p_token;
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.colaborador_remover_push(text, text) to anon, authenticated;
