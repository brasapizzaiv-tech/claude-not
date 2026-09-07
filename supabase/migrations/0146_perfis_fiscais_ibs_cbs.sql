-- Campos da reforma tributária (IS, IBS/CBS) nos perfis fiscais, como no
-- Suitable. Por enquanto só guardados (informativos em 2026); a NFC-e não
-- manda ainda — quando o emissor exigir, é só ligar.
alter table public.perfis_fiscais
  add column if not exists is_cst text,
  add column if not exists is_classificacao text,
  add column if not exists is_aliquota numeric(6,3),
  add column if not exists ibs_cbs_cst text,
  add column if not exists ibs_cbs_classificacao text,
  add column if not exists ibs_uf_aliquota numeric(6,3),
  add column if not exists ibs_mun_aliquota numeric(6,3),
  add column if not exists cbs_aliquota numeric(6,3);

-- Valores homologados pelo contador (print do Suitable, 07/09/2026).
update public.perfis_fiscais set is_cst='000', is_classificacao='000001', is_aliquota=0,
  ibs_cbs_cst='000', ibs_cbs_classificacao='000001', ibs_uf_aliquota=0.1, ibs_mun_aliquota=0, cbs_aliquota=0.9
where nome in ('Cervejas','Chicletes','Chocolates','Drinks','Refrigerante 600ml ou maior','Refrigerante lata ou garrafinha','Sucos');

update public.perfis_fiscais set ibs_cbs_classificacao='000001', ibs_uf_aliquota=0, ibs_mun_aliquota=0, cbs_aliquota=0
where nome = 'Água mineral';

update public.perfis_fiscais set ibs_uf_aliquota=0, ibs_mun_aliquota=0, cbs_aliquota=0
where nome in ('Refeições','Taxas de serviços e gorjetas');
