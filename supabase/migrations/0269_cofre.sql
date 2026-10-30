-- COFRE (Rafael, 30/10/2026). Todo dinheiro em espécie passa pelo cofre:
-- moedas (5, 10, 25, 50 centavos e R$ 1), troco (notas de 2, 5, 10, 20) e
-- notas grandes (50 e 100). O saldo NUNCA é digitado: sai da soma das
-- movimentações, cada uma com a quantidade de cada nota/moeda (positiva entra,
-- negativa sai). Mínimo e máximo por nota/moeda: abaixo do mínimo a tela do
-- cofre mostra o que encomendar (quem encomenda é a Ana), acima do máximo o
-- que depositar. O que sai dos caixas (fechamento e sangria) fica "esperando
-- entrar" até alguém contar e guardar; o fundo do caixa aberto sai do cofre.
-- Pagamento em dinheiro dá baixa numa conta do Contas a Pagar ou cria a conta
-- já paga (origem 'cofre'). Acesso: permissão "cofre" em Usuários.

create table if not exists public.cofre_denominacoes (
  empresa_id uuid not null default public.empresa_atual() references public.empresas (id),
  centavos   int  not null check (centavos > 0),
  minimo     int  not null default 0 check (minimo >= 0),
  maximo     int  not null default 0 check (maximo >= 0),
  primary key (empresa_id, centavos)
);

-- Começo do controle: a primeira contagem (saldo inicial). Antes dela nada
-- aparece como "esperando entrar".
create table if not exists public.cofre_config (
  empresa_id uuid primary key default public.empresa_atual() references public.empresas (id),
  inicio_em  timestamptz
);

create table if not exists public.cofre_movimentos (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null default public.empresa_atual() references public.empresas (id),
  tipo           text not null check (tipo in (
                   'contagem',      -- saldo inicial ou conferência (ajuste da diferença)
                   'entrada_caixa', -- dinheiro do fechamento do caixa
                   'sangria',       -- retirada do caixa durante o serviço
                   'fundo_caixa',   -- troco que sai pra abrir o caixa
                   'troco_motoboy', -- troco que sai com o motoboy
                   'pagamento',     -- conta paga em dinheiro
                   'deposito',      -- levado ao banco
                   'chegou_troco',  -- troco encomendado que chegou
                   'troca',         -- troca de notas (ex.: 100 por notas de 10)
                   'outro')),
  quantidades    jsonb not null default '{}',  -- {"200": 10, "5": -3} centavos → quantidade
  valor          numeric(12,2) not null default 0,  -- soma das quantidades (com sinal)
  esperado       numeric(12,2),                     -- o que o sistema esperava (caixa/sangria)
  descricao      text,
  origem_tipo    text check (origem_tipo in ('caixa', 'sangria', 'abertura')),
  origem_id      uuid,
  lancamento_id  uuid references public.lancamentos (id) on delete set null,
  pedido_id      uuid,
  criado_por     uuid default auth.uid(),
  criado_por_nome text,
  criado_em      timestamptz not null default now()
);
create index if not exists cofre_movimentos_empresa_idx on public.cofre_movimentos (empresa_id, criado_em desc);
create unique index if not exists cofre_movimentos_origem_uk on public.cofre_movimentos (empresa_id, origem_tipo, origem_id) where origem_id is not null;

create table if not exists public.cofre_pedidos (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null default public.empresa_atual() references public.empresas (id),
  quantidades    jsonb not null default '{}',
  valor          numeric(12,2) not null default 0,
  status         text not null default 'encomendado' check (status in ('encomendado', 'chegou', 'cancelado')),
  obs            text,
  criado_por_nome text,
  criado_em      timestamptz not null default now(),
  chegou_em      timestamptz,
  movimento_id   uuid references public.cofre_movimentos (id) on delete set null
);

alter table public.cofre_movimentos
  drop constraint if exists cofre_movimentos_pedido_fk;
alter table public.cofre_movimentos
  add constraint cofre_movimentos_pedido_fk foreign key (pedido_id) references public.cofre_pedidos (id) on delete set null;

do $$
declare t text;
begin
  foreach t in array array['cofre_denominacoes', 'cofre_config', 'cofre_movimentos', 'cofre_pedidos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_empresa', t);
    execute format('create policy %I on public.%I for all to authenticated using (empresa_id = public.empresa_atual()) with check (empresa_id = public.empresa_atual())', t || '_empresa', t);
  end loop;
end $$;

-- Notas e moedas de cada empresa (mínimo/máximo começam em 0: o dono preenche).
insert into public.cofre_denominacoes (empresa_id, centavos)
select e.id, d.c from public.empresas e
cross join (values (5), (10), (25), (50), (100), (200), (500), (1000), (2000), (5000), (10000)) as d(c)
on conflict do nothing;

-- Saldo por nota/moeda (soma das movimentações da empresa logada).
create or replace function public.cofre_saldo()
returns table (centavos int, quantidade bigint)
language sql stable security invoker set search_path = public as $$
  select (q.key)::int, sum((q.value)::bigint)
  from public.cofre_movimentos m, jsonb_each_text(m.quantidades) q
  where m.empresa_id = public.empresa_atual()
  group by 1
$$;
revoke all on function public.cofre_saldo() from public, anon;
grant execute on function public.cofre_saldo() to authenticated;

-- Conta paga pelo cofre.
alter table public.lancamentos drop constraint if exists lancamentos_origem_check;
alter table public.lancamentos
  add constraint lancamentos_origem_check check (origem in ('manual', 'pedido', 'nota', 'caixa', 'planilha', 'cofre'));
