-- Correção: cada categoria vai para UM colaborador (restrição única).
-- No modo "todos" (ou sem divisão anterior), distribui as categorias entre os
-- colaboradores ativos em rodízio.
create or replace function public.gerar_contagem_agendada(p_nome text, p_modo text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_cont uuid; v_ult uuid;
begin
  insert into contagens (descricao, status) values (p_nome, 'rascunho')
    returning id into v_cont;

  if p_modo = 'repetir_ultima' then
    select c.id into v_ult from contagens c
     where c.id <> v_cont
       and exists (select 1 from contagem_atribuicoes a where a.contagem_id = c.id)
     order by c.criado_em desc limit 1;
    if v_ult is not null then
      insert into contagem_atribuicoes (contagem_id, categoria_id, colaborador_id)
        select v_cont, categoria_id, colaborador_id
          from contagem_atribuicoes where contagem_id = v_ult;
    end if;
  end if;

  if p_modo = 'todos' or v_ult is null then
    insert into contagem_atribuicoes (contagem_id, categoria_id, colaborador_id)
    select v_cont, cat.id, col.id
      from (select id, (row_number() over (order by nome)) - 1 as rn
              from categorias) cat
      join (select id,
                   (row_number() over (order by nome)) - 1 as rn,
                   count(*) over () as total
              from colaboradores where ativo) col
        on (cat.rn % col.total) = col.rn;
  end if;

  insert into contagem_links (contagem_id, colaborador_id, token)
    select distinct v_cont, colaborador_id, replace(gen_random_uuid()::text, '-', '')
      from contagem_atribuicoes where contagem_id = v_cont;

  return v_cont;
end; $$;
