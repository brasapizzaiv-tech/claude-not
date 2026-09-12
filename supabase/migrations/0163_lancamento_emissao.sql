-- Data de emissão do documento (nota/recibo) no lançamento manual. Nas contas
-- que vieram de nota fiscal, é a data de emissão da nota.
alter table public.lancamentos add column if not exists emissao date;

-- Preenche o que dá: contas ligadas a uma nota herdam a emissão dela.
update public.lancamentos l
   set emissao = n.data_emissao
  from public.notas_fiscais n
 where l.nota_id = n.id and l.emissao is null and n.data_emissao is not null;
