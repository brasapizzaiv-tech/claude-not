-- Formas de pagamento viram cadastro (pedido do Rafael, 06/10/2026). Antes
-- eram listas fixas no código, em seis telas diferentes, e o código fiscal da
-- NFC-e, o tipo do TEF e o troco eram adivinhados pelo NOME da forma. Agora
-- cada forma tem um TIPO (dinheiro, pix, crédito, débito, cartão genérico,
-- vale, outro) que decide isso, e caixinhas dizendo em quais telas aparece.
--
-- Ficam FIXAS no código, porque são fluxos próprios e não formas que se criam:
-- "Saldo cliente" e "Compra da equipe" (caixa) e "Pix online" (app do cliente).
create table if not exists public.formas_pagamento (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.empresa_atual() references public.empresas (id),
  nome text not null,
  tipo text not null check (tipo in ('dinheiro', 'pix', 'credito', 'debito', 'cartao', 'vale', 'outro')),
  -- Texto diferente no app do cliente (ex.: "Cartão na entrega"). Vazio = nome.
  nome_app text,
  no_caixa boolean not null default true,
  no_pdv boolean not null default false,
  no_delivery boolean not null default false,
  no_app boolean not null default false,
  no_fiado boolean not null default false,
  ativo boolean not null default true,
  ordem integer not null default 0,
  criado_em timestamptz not null default now()
);
comment on table public.formas_pagamento is
  'Formas de pagamento da venda (caixa, PDV, delivery, app do cliente, fiado). O tipo decide troco, TEF e código fiscal.';

create unique index if not exists formas_pagamento_empresa_nome
  on public.formas_pagamento (empresa_id, lower(nome));
create index if not exists formas_pagamento_empresa_idx
  on public.formas_pagamento (empresa_id);

alter table public.formas_pagamento enable row level security;
drop policy if exists formas_pagamento_empresa on public.formas_pagamento;
create policy formas_pagamento_empresa on public.formas_pagamento
  for all to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

-- Explícito (a Supabase deixa de dar isso sozinha a partir de 30/10/2026).
grant select, insert, update, delete on public.formas_pagamento to authenticated, service_role;

-- As formas que existiam fixas no código, do jeito que cada tela usava.
insert into public.formas_pagamento (nome, tipo, nome_app, no_caixa, no_pdv, no_delivery, no_app, no_fiado, ordem)
select v.nome, v.tipo, v.nome_app, v.no_caixa, v.no_pdv, v.no_delivery, v.no_app, v.no_fiado, v.ordem
  from (values
    ('Dinheiro',          'dinheiro', null,                true,  true,  true,  true,  true,  1),
    ('Pix',               'pix',      'Pix na entrega',    true,  true,  true,  true,  true,  2),
    ('Cartão de crédito', 'credito',  null,                true,  false, true,  false, true,  3),
    ('Cartão de débito',  'debito',   null,                true,  false, true,  false, true,  4),
    ('Cartão',            'cartao',   'Cartão na entrega', false, true,  false, true,  false, 5),
    ('Vale refeição',     'vale',     null,                true,  false, false, false, false, 6)
  ) as v(nome, tipo, nome_app, no_caixa, no_pdv, no_delivery, no_app, no_fiado, ordem)
 where not exists (select 1 from public.formas_pagamento where empresa_id = public.empresa_atual());
