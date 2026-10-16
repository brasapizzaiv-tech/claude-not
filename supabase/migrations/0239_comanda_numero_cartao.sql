-- Cartões de comanda numerados (recepção, 1 a 200): quem abre digita o número
-- do cartão e ele vira o número da comanda. Pra numeração AUTOMÁTICA (garçom
-- sem cartão, PDV, delivery) nunca cair num cartão nem na balança (200+,
-- numerada pelo agente), ela recomeça em `numero_inicial_auto` (500) a cada
-- abertura de caixa e pula número que esteja com comanda aberta.

insert into public.pdv_config (chave, valor)
select 'numero_inicial_auto', '500'
where not exists (select 1 from public.pdv_config where chave = 'numero_inicial_auto');

-- Abrir caixa reinicia a numeração automática no número inicial (só logado).
create or replace function public.pdv_reiniciar_numeracao()
returns void
language sql
security definer
set search_path to 'public'
as $function$
  select public.exigir_logado();
  select setval(
    'public.pdv_comandas_numero_seq',
    coalesce((select nullif(valor, '')::bigint from public.pdv_config
               where chave = 'numero_inicial_auto' and empresa_id = public.empresa_atual() limit 1), 500),
    false);
$function$;

-- Número tirado da sequência que já está numa comanda ABERTA (cartão digitado
-- à mão, por exemplo) passa pro próximo livre. Número escolhido à mão (cartão,
-- balança) não é mexido: só o que acabou de sair da sequência nesta conexão.
create or replace function public.pdv_comandas_numero_livre()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v bigint;
begin
  begin
    v := currval('public.pdv_comandas_numero_seq');
  exception when others then
    return new; -- a sequência nem foi usada nesta conexão: número veio de fora
  end;
  if new.numero is distinct from v then
    return new;
  end if;
  while exists (
    select 1 from public.pdv_comandas c
     where c.status = 'aberta' and c.numero = new.numero and c.empresa_id is not distinct from new.empresa_id
  ) loop
    new.numero := nextval('public.pdv_comandas_numero_seq');
  end loop;
  return new;
end;
$function$;

drop trigger if exists pdv_comandas_numero_livre on public.pdv_comandas;
create trigger pdv_comandas_numero_livre
  before insert on public.pdv_comandas
  for each row execute function public.pdv_comandas_numero_livre();

-- O caixa da noite já está aberto: a numeração automática de hoje já pula
-- pros 500 (os cartões 1 a 200 ficam livres).
select setval('public.pdv_comandas_numero_seq', 500, false)
 where (select last_value from public.pdv_comandas_numero_seq) < 500;
