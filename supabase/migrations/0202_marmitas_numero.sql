-- Marmitas do convênio: número de cada pedido no dia, por filial (02/10/2026).
--
-- Pedido do Rafael: o entregador precisa conferir na entrega quem pegou
-- marmita em cada loja. A lista de conferência e a etiqueta precisam falar o
-- mesmo número — então o número fica GRAVADO no pedido (não é calculado na
-- hora: se um pedido do meio fosse apagado, as etiquetas já impressas ficariam
-- diferentes da lista). Sequência por (data, filial), na ordem em que os
-- pedidos chegam; apagar um deixa buraco, e tudo bem.
alter table public.mkt_pedidos add column if not exists numero integer;

-- Pedidos que já existem: numera na ordem de chegada.
with n as (
  select id, row_number() over (partition by data, filial order by criado_em nulls last, id) as rn
  from public.mkt_pedidos
)
update public.mkt_pedidos p set numero = n.rn from n where n.id = p.id and p.numero is null;

-- Daqui em diante o banco numera sozinho: ao inserir, e também quando o pedido
-- muda de filial na edição (entra no fim da sequência da filial nova).
create or replace function public.mkt_pedidos_numera() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' and new.numero is null
     or tg_op = 'UPDATE' and new.filial is distinct from old.filial then
    select coalesce(max(numero), 0) + 1 into new.numero
      from public.mkt_pedidos
     where data = new.data and filial = new.filial and id <> new.id;
  end if;
  return new;
end $$;

drop trigger if exists mkt_pedidos_numera on public.mkt_pedidos;
create trigger mkt_pedidos_numera
  before insert or update of filial on public.mkt_pedidos
  for each row execute function public.mkt_pedidos_numera();
