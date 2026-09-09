-- Pedido da equipe pode ser compra (repor algo) ou manutenção (consertar algo).
alter table public.solicitacoes_compra
  add column if not exists tipo text not null default 'compra'
  check (tipo in ('compra', 'manutencao'));
