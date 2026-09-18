-- Uma venda no caixa pode quitar VÁRIAS comandas de uma vez ("Comandas #249,
-- #248"), mas o movimento guardava só a primeira — o link "ver comanda" das
-- Movimentações abria uma só. Agora guarda todas.
alter table public.pdv_caixa_mov add column if not exists comanda_ids uuid[];

-- Preenche o histórico: casa os números escritos na descrição com as comandas
-- FECHADAS na mesma janela do movimento (±6 h). O número reinicia a cada caixa,
-- por isso a janela de tempo; quando fica ambíguo (mesmo número fechado duas
-- vezes na janela), a linha é deixada como está.
do $$
declare m record; ids uuid[]; nums int[];
begin
  for m in
    select id, descricao, criado_em, comanda_id
      from pdv_caixa_mov
     where tipo = 'venda' and comanda_ids is null and descricao ~ '#[0-9]+'
  loop
    select array_agg(x[1]::int) into nums
      from regexp_matches(m.descricao, '#([0-9]+)', 'g') as t(x);
    select array_agg(c.id order by c.numero desc) into ids
      from pdv_comandas c
     where c.numero = any(nums)
       and c.fechada_em between m.criado_em - interval '6 hours' and m.criado_em + interval '6 hours';
    -- Só grava quando achou exatamente um id por número (sem ambiguidade).
    if ids is not null and array_length(ids, 1) = array_length(nums, 1) then
      update pdv_caixa_mov set comanda_ids = ids where id = m.id;
    elsif m.comanda_id is not null then
      update pdv_caixa_mov set comanda_ids = array[m.comanda_id] where id = m.id;
    end if;
  end loop;
end $$;
