-- Salão: cada comanda pertence a uma "mesa" (Balcão, Mesa N, Balança...).
alter table public.pdv_comandas add column if not exists mesa text;

-- comandas de buffet antigas ficam na Balança
update public.pdv_comandas set mesa = 'Balança' where mesa is null;

create index if not exists idx_pdv_comandas_mesa_status
  on public.pdv_comandas (mesa, status);
