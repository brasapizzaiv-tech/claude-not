-- PIN do app da equipe com limite de tentativas (auditoria SEC-05, 08/11/2026).
-- Antes: o PIN de 4 dígitos era conferido em 7 funções do banco (que o celular
-- chama sem login) e em ~13 lugares do servidor, sem contar erro nenhum: com o
-- link de alguém, os 10 mil PINs saíam em minutos. E PIN nulo passava direto
-- (v_pin <> null dá null, e o "if" não barrava).
-- Agora tudo passa por colab_pin_ok(token, pin):
--   * 5 erros seguidos (dentro de 15 min) travam aquela pessoa por 15 min,
--     mesmo com o PIN certo;
--   * PIN vazio/nulo nunca passa quando a pessoa tem PIN (e não conta erro:
--     é só o celular sem o cookie abrindo a tela);
--   * acertou: zera a contagem.
-- Quem ainda não criou PIN continua entrando como antes (as telas que exigem PIN
-- já conferem isso antes).

create table if not exists public.colaborador_pin_tentativas (
  colaborador_id uuid primary key references public.colaboradores(id) on delete cascade,
  erros int not null default 0,
  travado_ate timestamptz,
  atualizado_em timestamptz not null default now()
);
alter table public.colaborador_pin_tentativas enable row level security;
-- Sem policy de propósito: só as funções abaixo e o servidor mexem.

create or replace function public.colab_pin_ok(p_token text, p_pin text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare v_id uuid; v_pin text; v_trava timestamptz; v_erros int;
begin
  select id, pin into v_id, v_pin from colaboradores where token = p_token and ativo;
  if v_id is null then return true; end if;   -- quem chama já trata "não achou"
  if v_pin is null then return true; end if;  -- ainda sem PIN: regra antiga

  select travado_ate into v_trava from colaborador_pin_tentativas where colaborador_id = v_id;
  if v_trava is not null and v_trava > now() then return false; end if;

  if coalesce(p_pin, '') = '' then return false; end if;

  if v_pin = p_pin then
    delete from colaborador_pin_tentativas where colaborador_id = v_id;
    return true;
  end if;

  insert into colaborador_pin_tentativas as t (colaborador_id, erros, travado_ate, atualizado_em)
  values (v_id, 1, null, now())
  on conflict (colaborador_id) do update
    set erros = case when t.travado_ate is not null or t.atualizado_em < now() - interval '15 minutes'
                     then 1 else t.erros + 1 end,
        travado_ate = null,
        atualizado_em = now()
  returning erros into v_erros;

  if v_erros >= 5 then
    update colaborador_pin_tentativas set travado_ate = now() + interval '15 minutes'
     where colaborador_id = v_id;
  end if;
  return false;
end;
$$;

-- Só diz se a pessoa está travada agora (pra tela explicar "espere 15 minutos").
create or replace function public.colab_pin_travado(p_token text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from colaborador_pin_tentativas t join colaboradores c on c.id = t.colaborador_id
     where c.token = p_token and t.travado_ate > now());
$$;

-- As 7 funções do app trocam a conferência antiga pela nova. Reescreve a partir
-- da definição que está no banco (só esse trecho muda) e para tudo se o trecho
-- não estiver lá — melhor falhar do que deixar uma sem a trava.
do $$
declare f record; def text; novo text; n int := 0;
begin
  for f in
    select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('colaborador_add_item', 'colaborador_conferir_pedido', 'colaborador_home',
                         'colaborador_pedidos', 'colaborador_registrar_push', 'colaborador_remove_item',
                         'colaborador_responder_entrega')
  loop
    n := n + 1;
    def := pg_get_functiondef(f.oid);
    if position('colab_pin_ok' in def) > 0 then continue; end if;
    novo := replace(def, 'v_pin is not null and v_pin <> p_pin', 'not public.colab_pin_ok(p_token, p_pin)');
    if novo = def then raise exception 'Conferência do PIN não encontrada em %', f.proname; end if;
    execute novo;
  end loop;
  if n <> 7 then raise exception 'Esperava 7 funções do app, achei %', n; end if;
end $$;
