-- 1) BUG-006: recebimento de fiado não é venda nova.
-- A venda no fiado já entra no faturamento no dia em que foi vendida ("Saldo
-- cliente"). Quando o cliente paga, o dinheiro entra no caixa (a conferência por
-- forma precisa dele), mas não pode contar de novo como faturamento.
alter table public.pdv_caixa_mov
  add column if not exists recebe_fiado boolean not null default false;
comment on column public.pdv_caixa_mov.recebe_fiado is
  'Recebimento de fiado (acerto do saldo do cliente): entra na conferência do caixa, fica fora do faturamento.';

-- Os acertos antigos: gravados por "Receber" no Fiado, sem comanda, com a
-- descrição "Fiado — <cliente>".
update public.pdv_caixa_mov
   set recebe_fiado = true
 where tipo = 'venda' and comanda_id is null and descricao like 'Fiado — %' and not recebe_fiado;

-- Faturamento do sistema por dia (DRE, CMV, Notas × Faturamento) sem os acertos de fiado.
create or replace function public.faturamento_sistema_dias(p_de date, p_ate date)
returns table (dia date, almoco numeric, noite numeric, vendas integer)
language sql
stable
security invoker
set search_path = public
as $$
  select (m.criado_em at time zone 'America/Sao_Paulo')::date as dia,
         coalesce(sum(m.valor) filter (where extract(hour from m.criado_em at time zone 'America/Sao_Paulo') < 16), 0)::numeric(14,2),
         coalesce(sum(m.valor) filter (where extract(hour from m.criado_em at time zone 'America/Sao_Paulo') >= 16), 0)::numeric(14,2),
         count(*)::int
    from pdv_caixa_mov m
   where m.tipo = 'venda'
     and not m.recebe_fiado
     and m.criado_em >= (p_de::timestamp at time zone 'America/Sao_Paulo')
     and m.criado_em <  ((p_ate + 1)::timestamp at time zone 'America/Sao_Paulo')
   group by 1
$$;
grant execute on function public.faturamento_sistema_dias(date, date) to authenticated, service_role;

-- 2) Nota avulsa: o que fazer quando ela for autorizada (pedido do Rafael, 08/11).
--   baixa_saldo: quanto sai do saldo do cliente (0 = não mexe no saldo);
--   caixa_forma: forma com que entra no caixa aberto (null = não entra no caixa).
-- Com baixa, a entrada no caixa é recebimento de fiado; sem baixa, é venda do dia.
-- fiado_id / mov_id guardam o que foi lançado, pra desfazer se a nota for cancelada.
alter table public.nfce_emitidas
  add column if not exists baixa_saldo numeric(12,2) not null default 0 check (baixa_saldo >= 0),
  add column if not exists caixa_forma text,
  add column if not exists lancado_em timestamptz,
  add column if not exists fiado_id uuid references public.cliente_fiado (id) on delete set null,
  add column if not exists mov_id uuid references public.pdv_caixa_mov (id) on delete set null;
