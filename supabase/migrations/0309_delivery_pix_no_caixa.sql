-- DEL-01 (Onda 5, delivery próprio): o Pix pago no app do cliente só marcava o
-- pedido como pago — nenhum movimento no caixa, a venda ficava fora do caixa e
-- do faturamento. Agora, ao cair o Pix, o sistema lança a venda no caixa aberto
-- e guarda aqui QUAL movimento foi (também trava pra não lançar duas vezes:
-- o app do cliente e a rotina de 5 em 5 min conferem o mesmo Pix). Sem caixa
-- aberto, fica vazio e a rotina lança assim que o caixa abrir.
alter table public.delivery_pedidos
  add column if not exists pix_mov_id uuid references public.pdv_caixa_mov(id) on delete set null;

create index if not exists delivery_pedidos_pix_pendente_idx
  on public.delivery_pedidos (empresa_id, pix_status)
  where pix_txid is not null;

-- DEL-11: uso do cupom.
--   - antes lia "usos" e gravava usos+1: dois pedidos juntos contavam um só e
--     passavam do limite. Agora uma função soma no banco, conferindo o limite;
--   - o pedido guarda QUAL cupom usou, e cancelar devolve o uso;
--   - opção "uma vez por cliente" (o BEMVINDO valia em todo pedido).
alter table public.delivery_pedidos
  add column if not exists cupom_id uuid references public.cupons(id) on delete set null;
alter table public.cupons
  add column if not exists uma_vez_por_cliente boolean not null default false;

-- Só o servidor (chave administrativa) chama: o app do cliente não tem login.
-- A trava fica DENTRO da função porque o scripts/migrate.mjs devolve o execute
-- de todas as funções ao papel authenticated depois de cada migration.
create or replace function public.cupom_usar(p_cupom uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_ok boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'so_servidor' using errcode = '42501';
  end if;
  update public.cupons set usos = usos + 1
   where id = p_cupom and ativo and (max_usos is null or usos < max_usos)
  returning true into v_ok;
  return coalesce(v_ok, false);
end;
$$;

create or replace function public.cupom_devolver(p_cupom uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'so_servidor' using errcode = '42501';
  end if;
  update public.cupons set usos = greatest(0, usos - 1) where id = p_cupom;
end;
$$;

revoke all on function public.cupom_usar(uuid) from public, anon, authenticated;
revoke all on function public.cupom_devolver(uuid) from public, anon, authenticated;
grant execute on function public.cupom_usar(uuid) to service_role;
grant execute on function public.cupom_devolver(uuid) to service_role;

notify pgrst, 'reload schema';
