-- Pix em lote: quem o banco CONFIRMOU que pagou (pedido do Rafael, 22/11/2026).
-- O dono sobe o PDF de comprovantes do Sicoob na janela "Arquivo Pix"; o
-- sistema acha cada pessoa nos arquivos da semana (pedaço do CPF + valor),
-- guarda aqui e lança o pagamento da semana como pago em Pix. Quem já está
-- aqui não volta marcado no próximo arquivo (não paga duas vezes).
--
-- Só servidor (RLS ligado e sem política), como as outras tabelas do 0324.
create table if not exists public.pagamento_lote_pagos (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null default public.empresa_atual() references public.empresas(id) on delete cascade,
  segunda        date not null,
  colaborador_id uuid not null references public.colaboradores(id) on delete cascade,
  arquivo_id     uuid references public.pagamento_lote_arquivos(id) on delete set null,
  valor          numeric(12, 2) not null,
  id_transacao   text not null,
  pago_em        timestamptz not null,
  criado_por     uuid,
  criado_em      timestamptz not null default now(),
  unique (empresa_id, id_transacao)
);
alter table public.pagamento_lote_pagos enable row level security;
create index if not exists pagamento_lote_pagos_semana_idx on public.pagamento_lote_pagos (empresa_id, segunda);

notify pgrst, 'reload schema';
