-- Bug: a versão atual de cotar_fornecedor_salvar deixou de gravar respondido_em
-- (só seta status='respondido'). A tela de comparação usa respondido_em, então
-- fornecedores que responderam apareciam como "não respondeu".
--
-- Solução robusta: um gatilho que grava respondido_em sempre que o status vira
-- 'respondido' — independente de qual versão da função rodar.

create or replace function public.set_respondido_em()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'respondido' and new.respondido_em is null then
    new.respondido_em := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_respondido_em on public.cotacao_fornecedores;
create trigger trg_respondido_em
  before insert or update on public.cotacao_fornecedores
  for each row execute function public.set_respondido_em();

-- Corrige os que já responderam mas ficaram sem a data.
update public.cotacao_fornecedores
   set respondido_em = now()
 where status = 'respondido' and respondido_em is null;
