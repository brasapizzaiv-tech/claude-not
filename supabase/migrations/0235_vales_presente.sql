-- VALE-PRESENTE COM CÓDIGO (pedido do Rafael, 15/10/2026)
-- O cliente compra um vale no caixa (o dinheiro entra no caixa do dia, como
-- venda); o sistema gera um código (8 letras/números, sem 0/O/1/I/L) que sai
-- em imagem pro WhatsApp, no cupom do caixa e num cartão pra imprimir.
-- Quando alguém usa, o caixa/PDV digita o código e dá baixa: o vale tem SALDO
-- (usa aos poucos) e validade (padrão 3 meses). O uso é a forma "Vale-presente"
-- (tipo vale_presente, migration 0233): fecha a conta sem contar de novo no
-- caixa nem no faturamento.

create table if not exists public.vales_presente (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null default public.empresa_atual() references public.empresas(id),
  codigo           text not null,                  -- só letras/números, maiúsculo, sem traço
  valor            numeric(10,2) not null check (valor > 0),
  saldo            numeric(10,2) not null check (saldo >= 0),
  para_nome        text,
  de_nome          text,
  mensagem         text,
  telefone         text,
  validade         date not null,
  forma_pagamento  text,
  caixa_id         uuid,
  caixa_mov_id     uuid,
  status           text not null default 'ativo' check (status in ('ativo', 'cancelado')),
  cancelado_em     timestamptz,
  cancelado_motivo text,
  criado_por       uuid default auth.uid(),
  criado_em        timestamptz not null default now(),
  unique (empresa_id, codigo)
);
create index if not exists vales_presente_criado_idx on public.vales_presente (empresa_id, criado_em desc);

-- Cada baixa (uso) e cada devolução de saldo (estorno). valor > 0 sempre;
-- o tipo diz o sentido.
create table if not exists public.vales_presente_usos (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null default public.empresa_atual() references public.empresas(id),
  vale_id      uuid not null references public.vales_presente(id) on delete cascade,
  tipo         text not null default 'uso' check (tipo in ('uso', 'estorno')),
  valor        numeric(10,2) not null check (valor > 0),
  origem       text,                                -- caixa | pdv | painel
  comanda_id   uuid,
  caixa_mov_id uuid,
  obs          text,
  criado_por   uuid default auth.uid(),
  criado_em    timestamptz not null default now()
);
create index if not exists vales_presente_usos_vale_idx on public.vales_presente_usos (vale_id, criado_em);

alter table public.vales_presente enable row level security;
alter table public.vales_presente_usos enable row level security;
do $$
declare t text;
begin
  foreach t in array array['vales_presente', 'vales_presente_usos'] loop
    execute format('drop policy if exists %I on public.%I', t || '_empresa', t);
    execute format('create policy %I on public.%I for all to authenticated using (empresa_id = public.empresa_atual()) with check (empresa_id = public.empresa_atual())', t || '_empresa', t);
  end loop;
end $$;
grant select, insert, update, delete on public.vales_presente, public.vales_presente_usos to authenticated, service_role;

-- Dá baixa num vale, de uma vez só e sem corrida (trava a linha): confere
-- status, validade e saldo. Devolve json {ok, erro?, uso_id, vale_id, saldo,
-- para, codigo}. SECURITY INVOKER: roda com a RLS de quem chama (anon não vê
-- nada, mesmo com o execute que o `npm run migrate` devolve).
create or replace function public.vale_presente_debitar(
  p_codigo text, p_valor numeric, p_origem text default 'caixa', p_comanda uuid default null
) returns json
language plpgsql security invoker set search_path = public as $$
declare
  v public.vales_presente;
  cod text := upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g'));
  val numeric(10,2) := round(coalesce(p_valor, 0), 2);
  uso uuid;
begin
  if val <= 0 then return json_build_object('ok', false, 'erro', 'Valor inválido.'); end if;
  select * into v from public.vales_presente where codigo = cod for update;
  if not found then return json_build_object('ok', false, 'erro', 'Código de vale não encontrado.'); end if;
  if v.status <> 'ativo' then return json_build_object('ok', false, 'erro', 'Este vale foi cancelado.'); end if;
  if v.validade < (now() at time zone 'America/Sao_Paulo')::date then
    return json_build_object('ok', false, 'erro', 'Vale vencido em ' || to_char(v.validade, 'DD/MM/YYYY') || '. Pra aceitar, prorrogue a validade em Vales-presente.');
  end if;
  if v.saldo < val then
    return json_build_object('ok', false, 'erro', 'O vale só tem R$ ' || replace(to_char(v.saldo, 'FM999990.00'), '.', ',') || ' de saldo.');
  end if;
  update public.vales_presente set saldo = saldo - val where id = v.id;
  insert into public.vales_presente_usos (empresa_id, vale_id, tipo, valor, origem, comanda_id)
    values (v.empresa_id, v.id, 'uso', val, p_origem, p_comanda) returning id into uso;
  return json_build_object('ok', true, 'uso_id', uso, 'vale_id', v.id, 'saldo', v.saldo - val, 'para', v.para_nome, 'codigo', v.codigo);
end $$;

-- Devolve ao vale o valor de uma baixa (a venda não fechou, ou o caixa
-- estornou). Só uma vez por uso.
create or replace function public.vale_presente_estornar(p_uso uuid, p_obs text default null)
returns json
language plpgsql security invoker set search_path = public as $$
declare u public.vales_presente_usos;
begin
  select * into u from public.vales_presente_usos where id = p_uso and tipo = 'uso' for update;
  if not found then return json_build_object('ok', false, 'erro', 'Baixa não encontrada.'); end if;
  if exists (select 1 from public.vales_presente_usos where tipo = 'estorno' and obs like 'uso:' || p_uso::text || '%') then
    return json_build_object('ok', false, 'erro', 'Essa baixa já foi devolvida.');
  end if;
  update public.vales_presente set saldo = saldo + u.valor where id = u.vale_id;
  insert into public.vales_presente_usos (empresa_id, vale_id, tipo, valor, origem, obs)
    values (u.empresa_id, u.vale_id, 'estorno', u.valor, 'painel', 'uso:' || p_uso::text || coalesce(' · ' || nullif(trim(p_obs), ''), ''));
  return json_build_object('ok', true);
end $$;

revoke execute on function public.vale_presente_debitar(text, numeric, text, uuid) from public;
revoke execute on function public.vale_presente_estornar(uuid, text) from public;
grant execute on function public.vale_presente_debitar(text, numeric, text, uuid) to authenticated, service_role;
grant execute on function public.vale_presente_estornar(uuid, text) to authenticated, service_role;

-- Cupom do vale na térmica do caixa (fila de impressão, ref_id = vales_presente.id).
alter table public.impressao_fila drop constraint if exists impressao_fila_tipo_check;
alter table public.impressao_fila add constraint impressao_fila_tipo_check
  check (tipo in ('etiqueta', 'comanda', 'teste', 'teste_etiqueta', 'marmita', 'nfce', 'fechamento', 'tef', 'vale'));
