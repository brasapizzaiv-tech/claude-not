-- Perfis fiscais (como no Suitable): um conjunto NCM/CEST/CFOP/CSOSN/origem/
-- unidade/PIS/COFINS com nome, aplicado por CATEGORIA do cardápio
-- (pdv_categorias) e, se precisar, por item (pdv_itens sobrepõe a categoria).
-- A NFC-e usa o perfil de cada item; sem perfil cai nos padrões da Config fiscal.
create table if not exists public.perfis_fiscais (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  ncm text,
  cest text,
  cfop text not null default '5102',
  csosn text not null default '102',
  origem text not null default '0',
  unidade text not null default 'UN',
  pis_cst text not null default '49',
  cofins_cst text not null default '49',
  homologado boolean not null default false,   -- conferido pelo contador
  obs text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
alter table public.perfis_fiscais enable row level security;
drop policy if exists "perfis_fiscais_auth" on public.perfis_fiscais;
create policy "perfis_fiscais_auth" on public.perfis_fiscais for all to authenticated using (true) with check (true);

alter table public.pdv_categorias add column if not exists perfil_fiscal_id uuid references public.perfis_fiscais(id) on delete set null;
alter table public.pdv_itens      add column if not exists perfil_fiscal_id uuid references public.perfis_fiscais(id) on delete set null;

-- Perfis iniciais = os 12 perfis homologados pelo contador no Suitable (07/09/2026).
insert into public.perfis_fiscais (nome, ncm, cest, cfop, csosn, origem, unidade, homologado, obs)
select * from (values
  ('Água mineral',                    '22011000', '0300100', '5102', '400', '0', 'UN', true, 'Importado do Suitable (homologado)'),
  ('Bala',                            '17049020', '2806200', '5102', '400', '0', 'UN', true, 'Importado do Suitable (homologado)'),
  ('Cervejas',                        '22030000', '0302100', '5405', '500', '0', 'UN', true, 'ICMS-ST já recolhido. Importado do Suitable (homologado)'),
  ('Chicletes',                       '17041000', '2806200', '5102', '400', '0', 'UN', true, 'Importado do Suitable (homologado)'),
  ('Chocolates',                      '18069000', '1700400', '5102', '400', '0', 'UN', true, 'Importado do Suitable (homologado)'),
  ('Drinks',                          '22089000', '0200200', '5405', '500', '0', 'UN', true, 'ICMS-ST já recolhido. Importado do Suitable (homologado)'),
  ('Refeições',                       '21069090', '1709700', '5102', '102', '0', 'UN', true, 'Pratos, porções, pizzas, marmitas, rodízio. Importado do Suitable (homologado)'),
  ('Refrigerante 600ml ou maior',     '22021000', '0301000', '5405', '500', '0', 'UN', true, 'ICMS-ST já recolhido. Importado do Suitable (homologado)'),
  ('Refrigerante lata ou garrafinha', '22021000', '0301100', '5405', '500', '0', 'UN', true, 'ICMS-ST já recolhido. Importado do Suitable (homologado)'),
  ('Sucos',                           '20096100', '1701000', '5102', '400', '0', 'UN', true, 'Importado do Suitable (homologado)'),
  ('Taxas de serviços e gorjetas',    '00000000', null,      '5102', '102', '0', 'UN', true, 'Importado do Suitable (homologado)'),
  ('Vinhos',                          '22042910', '0202400', '5102', '102', '0', 'UN', true, 'Importado do Suitable (homologado)')
) as v(nome, ncm, cest, cfop, csosn, origem, unidade, homologado, obs)
where not exists (select 1 from public.perfis_fiscais);

-- Categorias do cardápio com correspondência óbvia já saem ligadas.
update public.pdv_categorias c set perfil_fiscal_id = p.id
from public.perfis_fiscais p
where c.perfil_fiscal_id is null and (
  (lower(c.nome) in ('cerveja', 'cervejas') and p.nome = 'Cervejas') or
  (lower(c.nome) in ('vinho', 'vinhos') and p.nome = 'Vinhos') or
  (lower(c.nome) = 'drinks' and p.nome = 'Drinks') or
  (lower(c.nome) in ('suco', 'sucos') and p.nome = 'Sucos') or
  (lower(c.nome) in ('comida', 'porções', 'porcoes', 'rodízio', 'rodizio', 'marmitas', 'doces', 'pizzas', 'pizza', 'lanches', 'pratos') and p.nome = 'Refeições')
);
