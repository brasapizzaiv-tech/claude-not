-- Chave Pix do colaborador (pedido do Rafael, 21/11/2026): pra pagar a pessoa
-- (semana, adiantamento, acerto) sem ter que perguntar de novo. Fica na aba
-- "Dados pessoais" da ficha.
--
-- É dado pessoal: segue a regra da 0294/0295 — a sessão não lê a coluna na
-- tabela (o migrate.mjs tira com o resto dos PESSOAIS), só pela visão
-- colaboradores_dados, que pede a permissão Colaboradores.
alter table public.colaboradores
  add column if not exists pix_tipo text,
  add column if not exists pix_chave text;

-- Mesma visão da 0294 com as duas colunas novas no FIM (create or replace só
-- aceita coluna nova depois das que já existem).
create or replace view public.colaboradores_dados
with (security_barrier = true) as
select
  c.id, c.nome, c.nome_social, c.whatsapp, c.ativo, c.criado_em, c.empresa_id,
  c.funcao, c.turno, c.vinculo, c.vinculo_noite, c.esporadico, c.bate_ponto,
  c.dias_dia, c.dias_noite, c.recebe_10, c.peso_10,
  c.salario_base, c.valor_dia, c.valor_noite, c.valor_free,
  c.cpf, c.rg, c.pis, c.ctps, c.cnh, c.cnh_categoria, c.cnh_validade,
  c.nascimento, c.cep, c.endereco, c.endereco_numero, c.bairro, c.cidade, c.uf,
  c.telefone, c.telefone_emergencia, c.nome_pai, c.nome_mae, c.genero, c.tipo_sanguineo,
  c.conjuge, c.filhos, c.matricula, c.numero_folha, c.admissao, c.obs_cartao_ponto,
  c.departamento_id, c.cargo_id, c.superior_id, c.motivo_demissao_id,
  c.desligado_em, c.desligado_motivo,
  c.pix_tipo, c.pix_chave
from public.colaboradores c
where c.empresa_id = public.empresa_atual()
  and public.tem_permissao('colaboradores')
with local check option;

revoke all on public.colaboradores_dados from anon, public, authenticated;
grant select on public.colaboradores_dados to authenticated;

notify pgrst, 'reload schema';
