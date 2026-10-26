-- 10% DA EQUIPE: desconto pros custos de nota e cartão (Rafael, 26/10/2026).
-- Sobre o 10% arrecadado na noite, a casa fica com uma parte (padrão 10%) pra
-- cobrir imposto da nota e taxa do cartão; o resto é dividido entre quem
-- trabalhou. O valor da noite continua sendo o arrecadado (o que o caixa
-- cobrou); o desconto fica gravado em cada noite, pra mudar a regra depois não
-- mexer em semana já paga.
alter table public.dez_por_cento_noites
  add column if not exists desconto_pct numeric not null default 0;

-- Vale pras noites que ainda não foram pagas (acerto de 19/10 em diante; o de
-- 19/10 só tinha 3 adiantamentos lançados, sem o 10%).
update public.dez_por_cento_noites set desconto_pct = 10 where pagar_em >= date '2026-10-19';

-- Padrão das noites novas (Semana e 10% muda).
insert into public.pdv_config (empresa_id, chave, valor)
select e.id, 'dez_desconto_pct', '10' from public.empresas e
on conflict (empresa_id, chave) do nothing;
