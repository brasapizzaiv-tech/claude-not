-- Nota por RECEBIMENTO (pedido do Rafael em 10/11/2026): duas pessoas dividem
-- uma Coca e cada uma quer a NFC-e do que consumiu. Cada recebimento do caixa
-- guarda o que cobriu (itens e a fração de cada um, desconto, movimentos do
-- caixa) e a nota sai só com isso (src/lib/fiscal/recebimento-nota.ts).
-- Só acrescenta: tabela nova e duas colunas. Pode ir antes do código.

create table if not exists public.pdv_recebimentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.empresa_atual() references public.empresas(id),
  caixa_id uuid,
  comanda_ids uuid[] not null default '{}',
  -- [{tipo:'item'|'buffet', comanda_id, linha_id, item_id, descricao, qtd, preco_unit, numero, preco, valor}]
  itens jsonb not null default '[]'::jsonb,
  mov_ids uuid[] not null default '{}',
  desconto numeric not null default 0,
  valor numeric not null default 0,
  cliente_id uuid,
  criado_em timestamptz not null default now()
);
create index if not exists pdv_recebimentos_comandas on public.pdv_recebimentos using gin (comanda_ids);
create index if not exists pdv_recebimentos_empresa_data on public.pdv_recebimentos (empresa_id, criado_em desc);

alter table public.pdv_recebimentos enable row level security;
drop policy if exists pdv_recebimentos_modulo on public.pdv_recebimentos;
create policy pdv_recebimentos_modulo on public.pdv_recebimentos for all to authenticated
  using (empresa_id = public.empresa_atual() and ((select public.tem_permissao('salao')) or (select public.tem_permissao('pdv')) or (select public.tem_permissao('delivery'))))
  with check (empresa_id = public.empresa_atual() and ((select public.tem_permissao('salao')) or (select public.tem_permissao('pdv')) or (select public.tem_permissao('delivery'))));
revoke all on public.pdv_recebimentos from anon, public;

alter table public.nfce_pendentes add column if not exists recebimento_id uuid references public.pdv_recebimentos(id) on delete set null;
alter table public.nfce_emitidas add column if not exists recebimento_id uuid references public.pdv_recebimentos(id) on delete set null;
create index if not exists nfce_emitidas_recebimento on public.nfce_emitidas (recebimento_id) where recebimento_id is not null;

notify pgrst, 'reload schema';
