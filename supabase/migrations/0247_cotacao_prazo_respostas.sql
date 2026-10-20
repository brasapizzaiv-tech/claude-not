-- Prazo pra responder a cotação (Rafael, 20/10/2026): cada cotação tem um
-- "respostas até" (dia e hora). Passou a hora, o link do fornecedor trava e a
-- cotação fecha sozinha; reabrir pede um prazo novo. O prazo padrão (em horas,
-- contado do primeiro envio do link) fica junto da mensagem da cotação.
alter table public.cotacoes
  add column if not exists respostas_ate timestamptz;

alter table public.wpp_config
  add column if not exists cotacao_prazo_horas int check (cotacao_prazo_horas is null or cotacao_prazo_horas between 1 and 720);

-- Fecha as cotações cujo prazo já passou (chamada ao abrir as telas: não
-- depende de relógio rodando — quem olhar depois do prazo já vê fechada).
create or replace function public.cotacoes_fechar_vencidas()
returns int
language sql
security invoker
set search_path = public
as $$
  with f as (
    update cotacoes set status = 'fechada'
    where status = 'aberta' and respostas_ate is not null and respostas_ate <= now()
    returning 1
  )
  select count(*)::int from f;
$$;

-- Link do fornecedor: o prazo da cotação (e fecha se venceu).
create or replace function public.cotar_fornecedor_prazo(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_r record;
begin
  select cotacao_id into v_id from cotacao_fornecedores where token = p_token;
  if v_id is null then return null; end if;
  update cotacoes set status = 'fechada'
   where id = v_id and status = 'aberta' and respostas_ate is not null and respostas_ate <= now();
  select status, respostas_ate into v_r from cotacoes where id = v_id;
  return jsonb_build_object('status', v_r.status, 'respostas_ate', v_r.respostas_ate);
end;
$$;
grant execute on function public.cotar_fornecedor_prazo(text) to anon, authenticated;

-- Trava no banco: pelo link público (papel anon) não grava nada numa cotação
-- fechada ou com o prazo vencido — mesmo que a tela esteja aberta desde antes.
create or replace function public._cotacao_trava_fornecedor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_r record;
begin
  if coalesce(auth.role(), '') <> 'anon' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  v_id := case when tg_op = 'DELETE' then old.cotacao_id else new.cotacao_id end;
  select status, respostas_ate into v_r from cotacoes where id = v_id;
  if v_r.status = 'fechada' or (v_r.respostas_ate is not null and v_r.respostas_ate <= now()) then
    raise exception 'cotacao_fechada' using errcode = 'P0001', hint = 'O prazo desta cotação terminou.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists trava_prazo on public.cotacao_precos;
create trigger trava_prazo before insert or update or delete on public.cotacao_precos
  for each row execute function public._cotacao_trava_fornecedor();
drop trigger if exists trava_prazo on public.cotacao_ofertas_extra;
create trigger trava_prazo before insert or update or delete on public.cotacao_ofertas_extra
  for each row execute function public._cotacao_trava_fornecedor();
drop trigger if exists trava_prazo on public.cotacao_fornecedores;
create trigger trava_prazo before update on public.cotacao_fornecedores
  for each row execute function public._cotacao_trava_fornecedor();
